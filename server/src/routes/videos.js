// ================================================================
// routes/videos.js - the video API.
//
// Public endpoints (the app uses these, no password needed):
//   GET  /api/videos            -> list of published videos
//   GET  /api/videos/:id/stream -> watch a video (local-or-Drive)
//
// Admin endpoints (need the admin session cookie from /upload):
//   POST   /api/videos          -> upload a new video (file)
//   POST   /api/videos/from-url -> import from a pasted link (Facebook)
//   GET    /api/videos/all      -> every video incl. scheduled ones
//   DELETE /api/videos/:id      -> remove a video everywhere
// ================================================================

import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import os from "node:os";
import db, {
  insertVideo,
  listPublishedVideos,
  listAllVideos,
  getVideo,
  deleteVideo,
} from "../db.js";
import { downloadFromUrl } from "../fetcher.js";
import { uploadVideo, streamVideo, deleteDriveFile } from "../drive.js";
import {
  saveLocalCopy,
  hasLocalCopy,
  streamLocal,
  deleteLocalCopy,
} from "../storage.js";
import { requireAdmin, isAdmin } from "../auth.js";

const router = Router();

// Multer parks the incoming upload in the OS temp folder while we
// process it. Limit: 2GB - far more than a 3-minute devotional
// needs, but no reason to reject a high-quality file.
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

// ----------------------------------------------------------------
// GET /api/videos - what the app's main screen shows.
// Only videos whose publish date has arrived; the future stays
// hidden until its day comes.
// ----------------------------------------------------------------
router.get("/", (req, res) => {
  res.json(listPublishedVideos());
});

// ----------------------------------------------------------------
// GET /api/videos/all - admin view including scheduled videos.
// ----------------------------------------------------------------
router.get("/all", requireAdmin, (req, res) => {
  res.json(listAllVideos());
});

// ----------------------------------------------------------------
// GET /api/videos/:id/stream - THE playback endpoint.
//
// Failover logic, exactly as designed:
//   1st choice: the local copy on this (Namecheap) server.
//               Fastest - the bytes are already here.
//   2nd choice: Google Drive, if the local file is missing or
//               unreadable for any reason.
// One source per request, never both, and the phone has no idea
// which one it got. If BOTH fail we return an error and log it
// loudly so the admin can investigate.
// ----------------------------------------------------------------
router.get("/:id/stream", async (req, res) => {
  const video = getVideo(Number(req.params.id));
  if (!video) return res.status(404).json({ error: "Video no encontrado" });

  // Scheduled videos stay private until their day arrives. IDs are
  // sequential, so without this check anyone could watch tomorrow's
  // devotional today by guessing the next number. The admin (with
  // the session cookie) can still preview scheduled videos.
  // "en-CA" formats as YYYY-MM-DD in SERVER-LOCAL time, matching
  // the date('now','localtime') used for the public list query.
  const today = new Date().toLocaleDateString("en-CA");
  if (video.publish_date > today && !isAdmin(req)) {
    return res.status(404).json({ error: "Video no encontrado" });
  }

  const range = req.headers.range;

  // --- Attempt 1: local disk ---
  if (hasLocalCopy(video.id, video.mime_type)) {
    try {
      return await streamLocal(video.id, video.mime_type, range, res);
    } catch (err) {
      // Local file exists but something went wrong reading it
      // (corrupt file, disk error). Log it and fall through to
      // Drive - the viewer should never suffer for our disk.
      console.error(`[videos] Local copy failed for #${video.id}:`, err.message);
    }
  }

  // --- Attempt 2: Google Drive ---
  try {
    return await streamVideo(video.drive_file_id, range, res);
  } catch (err) {
    console.error(`[videos] Drive also failed for #${video.id}:`, err.message);
    if (!res.headersSent) {
      res.status(503).json({ error: "Video no disponible temporalmente" });
    }
  }
});

// ----------------------------------------------------------------
// The shared pipeline: given a video file sitting in a temp path,
// make it a real Diario Pan video.
//   1. Save the record in the catalog (gives us the video id)
//   2. Copy the file to local storage        (backup copy #1)
//   3. Upload the same file to Google Drive  (backup copy #2)
// If Drive fails we keep the local copy and still succeed - the
// admin sees a warning and can fix Drive later.
// Used by BOTH the manual upload and the Facebook-link import.
// ----------------------------------------------------------------
async function catalogVideo(tempPath, { title, publishDate, mimeType }) {
  // 1. Catalog entry first, so we have an id to name files with.
  const videoId = insertVideo({
    title,
    driveFileId: "pending", // patched below once Drive answers
    publishDate,
    mimeType,
    sizeBytes: fs.statSync(tempPath).size,
  });

  // 2. Local copy on this server's disk.
  await saveLocalCopy(tempPath, videoId, mimeType);

  // 3. Google Drive copy. Named after the publish date so the
  //    Drive folder reads like a diary.
  let driveWarning = null;
  try {
    const { fileId } = await uploadVideo(
      fs.createReadStream(tempPath),
      `diario-pan-${publishDate}.mp4`,
      mimeType
    );
    // Patch the real Drive id into the catalog.
    db.prepare(`UPDATE videos SET drive_file_id = ? WHERE id = ?`).run(
      fileId,
      videoId
    );
  } catch (err) {
    // Drive said no (quota, network, expired credentials...).
    // The local copy is safe, so the video WILL play.
    console.error("[videos] Drive upload failed:", err.message);
    driveWarning =
      "El video se guardó en el servidor, pero la copia en Google Drive falló. " +
      "Revisa las credenciales de Google.";
  }

  return { videoId, driveWarning };
}

// Shared helpers for both intake routes: default the date to
// today, and build the friendly default title ("Diario Pan – dd/mm/yyyy").
function resolveDateAndTitle(body) {
  let publishDate = (body?.publishDate || "").trim();
  // Anything that isn't a real YYYY-MM-DD date becomes "today" -
  // a malformed date would silently break every date comparison.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
    publishDate = new Date().toLocaleDateString("en-CA");
  }
  const [y, m, d] = publishDate.split("-");
  const title = (body?.title || "").trim() || `Diario Pan – ${d}/${m}/${y}`;
  return { publishDate, title };
}

// ----------------------------------------------------------------
// POST /api/videos - manual file upload (admin only).
// ----------------------------------------------------------------
router.post("/", requireAdmin, upload.single("video"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Falta el archivo de video" });

  const { publishDate, title } = resolveDateAndTitle(req.body);

  // Only accept real video types. The browser-reported mime type is
  // stored and later echoed back as Content-Type, so without this
  // whitelist someone with the admin cookie could host arbitrary
  // content (e.g. an HTML page) under diariopan.com.
  const ALLOWED_TYPES = ["video/mp4", "video/quicktime"];
  const mimeType = ALLOWED_TYPES.includes(file.mimetype)
    ? file.mimetype
    : "video/mp4";

  try {
    const { videoId, driveWarning } = await catalogVideo(file.path, {
      title,
      publishDate,
      mimeType,
    });
    res.json({ ok: true, videoId, title, publishDate, driveWarning });
  } catch (err) {
    console.error("[videos] Upload failed completely:", err.message);
    res.status(500).json({ error: "No se pudo guardar el video" });
  } finally {
    // Always remove multer's temp file, success or not.
    fs.unlink(file.path, () => {});
  }
});

// ----------------------------------------------------------------
// POST /api/videos/from-url - import from a pasted link (admin only).
//
// The uploader's dream workflow: post to Facebook as always, then
// paste the link here. yt-dlp downloads the video to a temp file
// and it flows through the exact same pipeline as a manual upload.
// Body: { url, publishDate?, title? }
// ----------------------------------------------------------------
router.post("/from-url", requireAdmin, async (req, res) => {
  const url = String(req.body?.url || "").trim();
  // Basic sanity: must look like a web link. yt-dlp does the rest.
  if (!/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ error: "Pega un enlace válido (https://...)" });
  }

  const { publishDate, title } = resolveDateAndTitle(req.body);

  let tempPath = null;
  try {
    // Download from Facebook (or wherever the link points).
    // Takes anywhere from seconds to a couple of minutes.
    tempPath = await downloadFromUrl(url);

    const { videoId, driveWarning } = await catalogVideo(tempPath, {
      title,
      publishDate,
      mimeType: "video/mp4", // yt-dlp always hands us an mp4
    });
    res.json({ ok: true, videoId, title, publishDate, driveWarning });
  } catch (err) {
    console.error("[videos] Link import failed:", err.message);
    // fetcher.js errors are already friendly Spanish - pass along.
    res.status(500).json({ error: err.message || "No se pudo importar el video" });
  } finally {
    if (tempPath) fs.unlink(tempPath, () => {});
  }
});

// ----------------------------------------------------------------
// DELETE /api/videos/:id - remove a video from catalog, local
// disk AND Drive (admin only). Drive errors are non-fatal: the
// catalog entry is gone either way, so the app stops showing it.
// ----------------------------------------------------------------
router.delete("/:id", requireAdmin, async (req, res) => {
  const video = getVideo(Number(req.params.id));
  if (!video) return res.status(404).json({ error: "Video no encontrado" });

  deleteVideo(video.id);
  deleteLocalCopy(video.id, video.mime_type);
  try {
    if (video.drive_file_id && video.drive_file_id !== "pending") {
      await deleteDriveFile(video.drive_file_id);
    }
  } catch (err) {
    console.error("[videos] Could not delete Drive file:", err.message);
  }
  res.json({ ok: true });
});

export default router;
