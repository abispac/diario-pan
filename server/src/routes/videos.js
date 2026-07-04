// ================================================================
// routes/videos.js - the video API.
//
// Public endpoints (the app uses these, no password needed):
//   GET  /api/videos            -> list of published videos
//   GET  /api/videos/:id/stream -> watch a video (local-or-Drive)
//
// Admin endpoints (need the admin session cookie from /upload):
//   POST   /api/videos          -> upload a new video
//   GET    /api/videos/all      -> every video incl. scheduled ones
//   DELETE /api/videos/:id      -> remove a video everywhere
// ================================================================

import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import os from "node:os";
import {
  insertVideo,
  listPublishedVideos,
  listAllVideos,
  getVideo,
  deleteVideo,
} from "../db.js";
import { uploadVideo, streamVideo, deleteDriveFile } from "../drive.js";
import {
  saveLocalCopy,
  hasLocalCopy,
  streamLocal,
  deleteLocalCopy,
} from "../storage.js";
import { requireAdmin } from "../auth.js";

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

  const range = req.headers.range;

  // --- Attempt 1: local disk ---
  if (hasLocalCopy(video.id, video.mime_type)) {
    try {
      return streamLocal(video.id, video.mime_type, range, res);
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
// POST /api/videos - the upload itself (admin only).
//
// The uploader's whole job: pick a file, pick a date, optional
// title, press the button. From here:
//   1. Save the record in the catalog (gives us the video id)
//   2. Copy the file to local storage        (backup copy #1)
//   3. Upload the same file to Google Drive  (backup copy #2)
//   4. Clean up the temp file
// If Drive fails we keep the local copy and still succeed - the
// admin sees a warning and can retry Drive later. If BOTH fail,
// the upload fails cleanly.
// ----------------------------------------------------------------
router.post("/", requireAdmin, upload.single("video"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Falta el archivo de video" });

  // The date the video should appear in the app. Defaults to
  // today if the uploader leaves the date picker alone.
  const publishDate =
    req.body.publishDate || new Date().toISOString().slice(0, 10);

  // A friendly default title in Spanish, e.g. "Diario Pan – 04/07/2026".
  const [y, m, d] = publishDate.split("-");
  const title = (req.body.title || "").trim() || `Diario Pan – ${d}/${m}/${y}`;

  const mimeType = file.mimetype || "video/mp4";

  try {
    // 1. Catalog entry first, so we have an id to name files with.
    const videoId = insertVideo({
      title,
      driveFileId: "pending", // patched below once Drive answers
      publishDate,
      mimeType,
      sizeBytes: file.size,
    });

    // 2. Local (Namecheap) copy.
    await saveLocalCopy(file.path, videoId, mimeType);

    // 3. Google Drive copy. Named after the publish date so the
    //    Drive folder reads like a diary.
    let driveWarning = null;
    try {
      const { fileId } = await uploadVideo(
        fs.createReadStream(file.path),
        `diario-pan-${publishDate}.mp4`,
        mimeType
      );
      // Patch the real Drive id into the catalog.
      const { default: db } = await import("../db.js");
      db.prepare(`UPDATE videos SET drive_file_id = ? WHERE id = ?`).run(
        fileId,
        videoId
      );
    } catch (err) {
      // Drive said no (quota, network, expired credentials...).
      // The local copy is safe, so the video WILL play. Tell the
      // admin so they can fix Drive and re-upload if they want.
      console.error("[videos] Drive upload failed:", err.message);
      driveWarning =
        "El video se guardó en el servidor, pero la copia en Google Drive falló. " +
        "Revisa las credenciales de Google.";
    }

    res.json({ ok: true, videoId, title, publishDate, driveWarning });
  } catch (err) {
    console.error("[videos] Upload failed completely:", err.message);
    res.status(500).json({ error: "No se pudo guardar el video" });
  } finally {
    // 4. Always remove multer's temp file, success or not.
    fs.unlink(file.path, () => {});
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
