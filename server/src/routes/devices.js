// ================================================================
// routes/devices.js - phones registering for notifications.
//
// The app calls this once after the welcome video (when the user
// picks their notification time) and again any time the user
// changes the time in Settings. No account, no password, no
// personal data - just an anonymous push token plus a preferred
// time and timezone. Privacy-friendly by design.
// ================================================================

import { Router } from "express";
import { Expo } from "expo-server-sdk";
import { upsertDevice, deleteDevice } from "../db.js";

const router = Router();

// POST /api/devices
// Body: { pushToken, notifyHour, notifyMinute, timezone }
router.post("/", (req, res) => {
  const { pushToken, notifyHour, notifyMinute, timezone } = req.body || {};

  // Basic sanity checks - reject garbage before it hits the DB.
  // This endpoint is public (phones call it with no password), so
  // only real Expo push tokens are allowed in - otherwise anyone
  // could fill the database with junk rows.
  if (!pushToken || typeof pushToken !== "string") {
    return res.status(400).json({ error: "Falta el token de notificaciones" });
  }
  if (pushToken.length > 200 || !Expo.isExpoPushToken(pushToken)) {
    return res.status(400).json({ error: "Token de notificaciones inválido" });
  }
  const hour = Number(notifyHour);
  const minute = Number(notifyMinute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return res.status(400).json({ error: "Hora inválida (0-23)" });
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return res.status(400).json({ error: "Minuto inválido (0-59)" });
  }

  upsertDevice({
    pushToken,
    notifyHour: hour,
    notifyMinute: minute,
    // If the app didn't send a timezone, assume US Eastern -
    // adjust the default to wherever most of the congregation is.
    timezone: isValidTimezone(timezone) ? timezone : "America/New_York",
  });
  res.json({ ok: true });
});

// Is this a real IANA timezone name? (Intl throws on unknown ones.)
function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// DELETE /api/devices - the user turned notifications off in
// Settings; forget their token entirely.
router.delete("/", (req, res) => {
  const { pushToken } = req.body || {};
  if (pushToken) deleteDevice(pushToken);
  res.json({ ok: true });
});

export default router;
