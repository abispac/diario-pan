// ================================================================
// drive.js - everything that talks to Google Drive.
//
// The big idea: the uploader NEVER touches Google Drive. They just
// pick a file on the /upload page. This server receives it and
// pushes it into the church's Drive account (the 2TB plan) using
// the Drive API. Later, when a phone wants to watch a video, the
// server pulls the bytes back out of Drive and streams them to
// the phone. Drive is our warehouse; this server is the shop
// window.
//
// We authenticate with an OAuth "refresh token" that belongs to
// the Google account owning the 2TB storage. Get it once with
// `npm run get-google-token` and it keeps working indefinitely.
// ================================================================

import { google } from "googleapis";
import { config } from "./config.js";

// Build one authenticated Drive client and reuse it everywhere.
// The googleapis library automatically swaps the refresh token
// for short-lived access tokens as needed - we never think about
// token expiry again.
function makeDriveClient() {
  const oauth2 = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret
  );
  oauth2.setCredentials({ refresh_token: config.google.refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

const drive = makeDriveClient();

// ----------------------------------------------------------------
// uploadVideo(stream, filename, mimeType) -> Drive file id
//
// We pass the incoming upload straight through to Drive as a
// stream. The video is never fully held in this server's memory,
// so even a big file works fine on a cheap host.
// ----------------------------------------------------------------
export async function uploadVideo(fileStream, filename, mimeType) {
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      // Drop it inside the dedicated Diario Pan folder so the
      // account owner's Drive stays tidy.
      parents: [config.google.folderId],
    },
    media: {
      mimeType,
      body: fileStream,
    },
    fields: "id, size",
  });
  return { fileId: res.data.id, size: Number(res.data.size) || null };
}

// ----------------------------------------------------------------
// streamVideo(fileId, rangeHeader, res)
//
// Streams a video from Drive to the phone, honoring HTTP "Range"
// requests. Range support is what lets a video player seek to the
// middle of a video and start playing instantly instead of
// downloading everything first. We simply forward the phone's
// Range header to Drive and pipe Drive's answer back.
// ----------------------------------------------------------------
export async function streamVideo(fileId, rangeHeader, res) {
  const driveRes = await drive.files.get(
    { fileId, alt: "media" },
    {
      responseType: "stream",
      // Forward the byte range the player asked for (if any).
      headers: rangeHeader ? { Range: rangeHeader } : {},
    }
  );

  // Mirror the important headers from Drive's response so the
  // phone's video player sees a proper, seekable video stream.
  res.status(driveRes.status); // 200 (full) or 206 (partial)
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    if (driveRes.headers[h]) res.setHeader(h, driveRes.headers[h]);
  }

  // Pipe the bytes through. If the phone disconnects mid-video
  // (user closed the app), destroy the Drive stream too so we
  // don't keep downloading for nobody.
  //
  // IMPORTANT: without an 'error' listener, a network hiccup from
  // Google mid-stream would crash the entire Node process.
  driveRes.data.on("error", (err) => {
    console.error("[drive] Stream error mid-download:", err.message);
    if (!res.headersSent) {
      res.status(503).json({ error: "Video no disponible temporalmente" });
    } else {
      res.destroy(); // too late for a clean error; drop the connection
    }
  });
  driveRes.data.pipe(res);
  res.on("close", () => driveRes.data.destroy());
}

// Remove a video file from Drive (used when the admin deletes a
// video from the catalog).
export async function deleteDriveFile(fileId) {
  await drive.files.delete({ fileId });
}
