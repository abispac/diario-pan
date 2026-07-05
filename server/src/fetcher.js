// ================================================================
// fetcher.js - downloads a video from a pasted link (Facebook,
// etc.) using yt-dlp, the battle-tested open-source downloader.
//
// Why this exists: the pastor's team already posts the devotional
// to Facebook every morning. Instead of asking them to ALSO handle
// the video file, they just paste the Facebook link on /upload and
// this module pulls the video down. From there it enters the
// normal pipeline (local copy + Google Drive + catalog) exactly
// as if it had been uploaded by hand.
//
// Requirements on the machine running the server:
//   macOS:  brew install yt-dlp ffmpeg
//   Ubuntu: sudo apt install ffmpeg  +  yt-dlp binary (see DEPLOY.md)
// ================================================================

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Hard cap so a bad link can't run forever (10 minutes is plenty
// for a 3-minute devotional even on slow connections).
const TIMEOUT_MS = 10 * 60 * 1000;

// downloadFromUrl(url) -> Promise<pathToTempMp4>
// Rejects with a human-readable (Spanish) error if anything fails;
// the route passes that message straight to the upload page.
export function downloadFromUrl(url) {
  return new Promise((resolve, reject) => {
    // Unique temp filename; yt-dlp writes the video here.
    const outPath = path.join(os.tmpdir(), `diario-pan-${crypto.randomUUID()}.mp4`);

    const args = [
      // Best video+audio combined into an mp4 (needs ffmpeg); if
      // that's unavailable, fall back to the best single mp4 file.
      "-f", "bv*+ba/b[ext=mp4]/b",
      "--merge-output-format", "mp4",
      "--no-playlist",          // one video, never a whole page of them
      "--max-filesize", "2G",   // same ceiling as manual uploads
      "--no-progress",          // keep server logs clean
      "-o", outPath,
      url,
    ];

    const proc = spawn("yt-dlp", args);

    // Collect stderr so failures produce a useful log line.
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d; });

    // Kill the process if it exceeds the time cap.
    const timer = setTimeout(() => proc.kill("SIGKILL"), TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        // yt-dlp isn't installed on this machine.
        reject(new Error(
          "yt-dlp no está instalado en el servidor. " +
          "macOS: brew install yt-dlp ffmpeg"
        ));
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      // Success = clean exit AND a non-empty file on disk.
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        resolve(outPath);
      } else {
        console.error("[fetcher] yt-dlp failed:", stderr.slice(-500));
        fs.unlink(outPath, () => {}); // clean up any partial file
        reject(new Error(
          "No se pudo descargar el video de ese enlace. " +
          "Verifica que el video sea público y el enlace correcto."
        ));
      }
    });
  });
}
