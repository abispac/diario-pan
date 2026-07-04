// ================================================================
// db.js - the tiny database layer.
//
// We use SQLite (a single file on disk) instead of a "real"
// database server. Why? Because this project stores maybe one
// video record per day plus a list of phones - a few kilobytes
// per year. SQLite handles that effortlessly, needs zero setup,
// and works on any cheap host. Keep it simple.
// ================================================================

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Figure out where "server/data/" is, relative to this file,
// and make sure the folder exists before SQLite tries to write.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

// Open (or create on first run) the database file.
const db = new Database(path.join(dataDir, "diariopan.sqlite"));

// WAL mode = better behavior when the cron job and a web request
// touch the database at the same moment.
db.pragma("journal_mode = WAL");

// ----------------------------------------------------------------
// Schema. "CREATE TABLE IF NOT EXISTS" means this is safe to run
// on every startup - it only does something the very first time.
// ----------------------------------------------------------------
db.exec(`
  -- One row per devotional video.
  CREATE TABLE IF NOT EXISTS videos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,            -- e.g. "Diario Pan - 4 de julio"
    drive_file_id TEXT NOT NULL,            -- where the file lives in Google Drive
    publish_date  TEXT NOT NULL,            -- YYYY-MM-DD chosen by the uploader
    mime_type     TEXT NOT NULL DEFAULT 'video/mp4',
    size_bytes    INTEGER,                  -- handy for the admin page
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    notified      INTEGER NOT NULL DEFAULT 0  -- 1 once push notifications went out
  );

  -- One row per phone that installed the app.
  CREATE TABLE IF NOT EXISTS devices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    push_token    TEXT UNIQUE NOT NULL,     -- Expo push token, identifies the phone
    notify_hour   INTEGER NOT NULL DEFAULT 8,   -- 0-23, hour the user wants the alert
    notify_minute INTEGER NOT NULL DEFAULT 0,   -- 0-59
    timezone      TEXT NOT NULL DEFAULT 'America/New_York',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ----------------------------------------------------------------
// Video queries
// ----------------------------------------------------------------

// Save a freshly uploaded video. Returns the new row's id.
export function insertVideo({ title, driveFileId, publishDate, mimeType, sizeBytes }) {
  const stmt = db.prepare(`
    INSERT INTO videos (title, drive_file_id, publish_date, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(title, driveFileId, publishDate, mimeType, sizeBytes).lastInsertRowid;
}

// The app's main screen: every video whose publish date has
// arrived, newest first. Videos scheduled for the future stay
// hidden until their day comes - that is the whole "date picker"
// feature working.
export function listPublishedVideos() {
  return db
    .prepare(
      `SELECT id, title, publish_date, mime_type
         FROM videos
        WHERE publish_date <= date('now', 'localtime')
        ORDER BY publish_date DESC, id DESC`
    )
    .all();
}

// Everything, including scheduled-for-the-future videos.
// Only the admin page uses this.
export function listAllVideos() {
  return db
    .prepare(`SELECT * FROM videos ORDER BY publish_date DESC, id DESC`)
    .all();
}

export function getVideo(id) {
  return db.prepare(`SELECT * FROM videos WHERE id = ?`).get(id);
}

export function deleteVideo(id) {
  return db.prepare(`DELETE FROM videos WHERE id = ?`).run(id);
}

// Videos that are published (their day arrived) but for which we
// have not yet sent push notifications. The cron job asks for
// these once a minute.
export function listUnnotifiedPublishedVideos() {
  return db
    .prepare(
      `SELECT * FROM videos
        WHERE notified = 0
          AND publish_date <= date('now', 'localtime')`
    )
    .all();
}

export function markVideoNotified(id) {
  db.prepare(`UPDATE videos SET notified = 1 WHERE id = ?`).run(id);
}

// ----------------------------------------------------------------
// Device queries
// ----------------------------------------------------------------

// Register a phone, or update its preferred time if we already
// know it. "UPSERT" keeps this a single, race-free statement.
export function upsertDevice({ pushToken, notifyHour, notifyMinute, timezone }) {
  db.prepare(
    `INSERT INTO devices (push_token, notify_hour, notify_minute, timezone)
     VALUES (@pushToken, @notifyHour, @notifyMinute, @timezone)
     ON CONFLICT(push_token) DO UPDATE SET
       notify_hour   = @notifyHour,
       notify_minute = @notifyMinute,
       timezone      = @timezone,
       updated_at    = datetime('now')`
  ).run({ pushToken, notifyHour, notifyMinute, timezone });
}

export function listDevices() {
  return db.prepare(`SELECT * FROM devices`).all();
}

// If Expo tells us a token is dead (app uninstalled), forget it.
export function deleteDevice(pushToken) {
  db.prepare(`DELETE FROM devices WHERE push_token = ?`).run(pushToken);
}

export default db;
