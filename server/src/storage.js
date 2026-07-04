// ================================================================
// storage.js - the local (Namecheap) copy of every video.
//
// Videos live in TWO places:
//   1. This server's own disk  -> fast to serve, same machine
//   2. Google Drive (2TB plan) -> durable backup, "source of truth"
//
// Playback rule (implemented in routes/videos.js): serve from the
// local disk if the file is there and healthy; otherwise fall back
// to Google Drive. One source per playback, never both, and the
// viewer never notices which one was used.
//
// If the host has limited disk space, set LOCAL_KEEP_DAYS in .env
// (e.g. 60) and a nightly job deletes local copies older than
// that. Drive always keeps everything, so nothing is ever lost -
// old videos just stream from Drive instead.
// ================================================================

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/storage/videos/ - created automatically on first run.
const videosDir = path.join(__dirname, "..", "storage", "videos");
fs.mkdirSync(videosDir, { recursive: true });

// How many days of local copies to keep. 0 (the default) means
// "keep everything locally forever".
const KEEP_DAYS = Number(process.env.LOCAL_KEEP_DAYS) || 0;

// Local files are named "<videoId>.<ext>" so we never have to
// worry about weird characters in uploaded filenames.
export function localPathFor(videoId, mimeType) {
  const ext = mimeType === "video/quicktime" ? "mov" : "mp4";
  return path.join(videosDir, `${videoId}.${ext}`);
}

// Save an uploaded temp file as the local copy of a video.
// We copy (not move) because the same temp file is also being
// read by the Google Drive upload.
export async function saveLocalCopy(tempFilePath, videoId, mimeType) {
  const dest = localPathFor(videoId, mimeType);
  await pipeline(fs.createReadStream(tempFilePath), fs.createWriteStream(dest));
  return dest;
}

// Is a healthy local copy available? "Healthy" here means the
// file exists and is not zero bytes (a crashed copy could leave
// an empty file behind - we'd rather fall back to Drive than
// serve a broken video).
export function hasLocalCopy(videoId, mimeType) {
  try {
    const stat = fs.statSync(localPathFor(videoId, mimeType));
    return stat.size > 0;
  } catch {
    return false; // file does not exist
  }
}

// ----------------------------------------------------------------
// streamLocal(videoId, mimeType, rangeHeader, res)
//
// Serve the local file with full HTTP Range support, same as the
// Drive path, so the player can seek freely.
// ----------------------------------------------------------------
export function streamLocal(videoId, mimeType, rangeHeader, res) {
  const filePath = localPathFor(videoId, mimeType);
  const { size } = fs.statSync(filePath);

  if (rangeHeader) {
    // Range header looks like "bytes=12345-" or "bytes=0-999".
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : size - 1;

    res.status(206); // Partial Content
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", end - start + 1);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeType);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    // No range requested: send the whole file.
    res.status(200);
    res.setHeader("Content-Length", size);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeType);
    fs.createReadStream(filePath).pipe(res);
  }
}

// Delete the local copy (admin deleted the video, or pruning).
export function deleteLocalCopy(videoId, mimeType) {
  try {
    fs.unlinkSync(localPathFor(videoId, mimeType));
  } catch {
    // Already gone - that's fine, mission accomplished.
  }
}

// ----------------------------------------------------------------
// pruneOldLocalCopies(videos)
//
// Called nightly by the cron in push.js. Removes local files for
// videos older than LOCAL_KEEP_DAYS. Does nothing if KEEP_DAYS
// is 0. Drive copies are never touched.
// ----------------------------------------------------------------
export function pruneOldLocalCopies(videos) {
  if (!KEEP_DAYS) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  for (const video of videos) {
    if (video.publish_date < cutoffStr) {
      deleteLocalCopy(video.id, video.mime_type);
    }
  }
}
