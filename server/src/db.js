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

  -- Editable settings: anything the admin can change from /upload
  -- without touching code. One row per setting, key/value.
  -- Today that is the Plan de Lectura card; tomorrow, whatever else.
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per phone that installed the app.
  CREATE TABLE IF NOT EXISTS devices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    push_token    TEXT UNIQUE NOT NULL,     -- Expo push token, identifies the phone
    notify_hour   INTEGER NOT NULL DEFAULT 8,   -- 0-23, hour the user wants the alert
    notify_minute INTEGER NOT NULL DEFAULT 0,   -- 0-59
    timezone      TEXT NOT NULL DEFAULT 'America/New_York',
    alarm_mode    INTEGER NOT NULL DEFAULT 0,
    last_notified_date TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Existing installations already have the devices table. SQLite's
// CREATE TABLE IF NOT EXISTS does not add new columns, so apply this
// small forward-only migration once.
const deviceColumns = db.pragma("table_info(devices)");
if (!deviceColumns.some((column) => column.name === "alarm_mode")) {
  db.exec(`ALTER TABLE devices ADD COLUMN alarm_mode INTEGER NOT NULL DEFAULT 0`);
}
if (!deviceColumns.some((column) => column.name === "last_notified_date")) {
  db.exec(`ALTER TABLE devices ADD COLUMN last_notified_date TEXT`);
}

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
          AND publish_date <= date('now', 'localtime')
        ORDER BY publish_date DESC, id DESC`
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
export function upsertDevice({
  pushToken,
  notifyHour,
  notifyMinute,
  timezone,
  alarmMode,
}) {
  db.prepare(
    `INSERT INTO devices
       (push_token, notify_hour, notify_minute, timezone, alarm_mode)
     VALUES
       (@pushToken, @notifyHour, @notifyMinute, @timezone, @alarmMode)
     ON CONFLICT(push_token) DO UPDATE SET
       notify_hour   = @notifyHour,
       notify_minute = @notifyMinute,
       timezone      = @timezone,
       alarm_mode    = @alarmMode,
       updated_at    = datetime('now')`
  ).run({
    pushToken,
    notifyHour,
    notifyMinute,
    timezone,
    alarmMode: alarmMode ? 1 : 0,
  });
}

export function listDevices() {
  return db.prepare(`SELECT * FROM devices`).all();
}

export function markDeviceNotified(pushToken, localDate) {
  db.prepare(
    `UPDATE devices
        SET last_notified_date = ?, updated_at = datetime('now')
      WHERE push_token = ?`
  ).run(localDate, pushToken);
}

// If Expo tells us a token is dead (app uninstalled), forget it.
export function deleteDevice(pushToken) {
  db.prepare(`DELETE FROM devices WHERE push_token = ?`).run(pushToken);
}

// ----------------------------------------------------------------
// Settings (what the admin edits at /upload)
// ----------------------------------------------------------------

// The values the site and the app fall back to when nothing has
// been saved yet. These match what used to be hard-coded in the
// pages, so the very first load after this update looks identical.
export const SETTING_DEFAULTS = {
  reading_plan_url:
    "https://drive.google.com/file/d/1SCdFikj3DlsTYyI7DgHeR-SPQw-Y7cJd/view?usp=sharing",
  reading_plan_title: "Plan de Lectura",
  reading_plan_desc:
    "La guía de lectura bíblica del año, día por día. Ábrela en el teléfono o imprímela para la mesa.",
};

// Every setting, with defaults filled in for anything unsaved.
export function getSettings() {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const [key, fallback] of Object.entries(SETTING_DEFAULTS)) {
    // An empty saved value means "I cleared this" -> use the default,
    // so the card can never end up blank or pointing nowhere.
    out[key] = saved[key]?.trim() ? saved[key] : fallback;
  }
  return out;
}

// Save a batch of settings. Unknown keys are ignored on purpose:
// the admin page can only change what we decided is changeable.
export function saveSettings(values = {}) {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = datetime('now')`
  );
  const write = db.transaction((entries) => {
    for (const [key, value] of entries) stmt.run(key, String(value ?? ""));
  });
  write(Object.entries(values).filter(([key]) => key in SETTING_DEFAULTS));
  return getSettings();
}

export default db;
