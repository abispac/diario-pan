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
import { upsertDevice, deleteDevice } from "../db.js";

const router = Router();

// POST /api/devices
// Body: { pushToken, notifyHour, notifyMinute, timezone }
router.post("/", (req, res) => {
  const { pushToken, notifyHour, notifyMinute, timezone } = req.body || {};

  // Basic sanity checks - reject garbage before it hits the DB.
  if (!pushToken || typeof pushToken !== "string") {
    return res.status(400).json({ error: "Falta el token de notificaciones" });
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
    timezone: typeof timezone === "string" && timezone ? timezone : "America/New_York",
  });
  res.json({ ok: true });
});

// DELETE /api/devices - the user turned notifications off in
// Settings; forget their token entirely.
router.delete("/", (req, res) => {
  const { pushToken } = req.body || {};
  if (pushToken) deleteDevice(pushToken);
  res.json({ ok: true });
});

export default router;
