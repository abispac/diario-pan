// ================================================================
// routes/settings.js - the things the admin can change without a
// developer: today, the Plan de Lectura card.
//
// Public endpoint (the website and the app read this, no password):
//   GET /api/settings      -> { reading_plan_url, ... }
//
// Admin endpoint (needs the session cookie from /upload):
//   PUT /api/settings      -> save and return the new values
// ================================================================

import { Router } from "express";
import { getSettings, saveSettings } from "../db.js";
import { requireAdmin } from "../auth.js";

const router = Router();

// ----------------------------------------------------------------
// GET /api/settings - read by index.html and by the mobile app.
// Cached briefly: the card changes a few times a year, but we
// still want an edit to show up the same day without a redeploy.
// ----------------------------------------------------------------
router.get("/", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(getSettings());
});

// ----------------------------------------------------------------
// PUT /api/settings - save from the admin page.
// ----------------------------------------------------------------
router.put("/", requireAdmin, (req, res) => {
  const body = req.body || {};

  // The link is the one value that can break the card for everyone,
  // so it gets checked. Anything that is not a normal web address
  // is refused with a message the uploader can act on.
  if (typeof body.reading_plan_url === "string" && body.reading_plan_url.trim()) {
    let parsed;
    try {
      parsed = new URL(body.reading_plan_url.trim());
    } catch {
      return res.status(400).json({
        error: "El enlace no es válido. Debe empezar con https://",
      });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return res.status(400).json({
        error: "El enlace no es válido. Debe empezar con https://",
      });
    }
  }

  // Keep the written text to a sane length - this is a card on a
  // phone screen, not an article.
  const trim = (value, max) => String(value ?? "").trim().slice(0, max);

  const saved = saveSettings({
    reading_plan_url: trim(body.reading_plan_url, 500),
    reading_plan_title: trim(body.reading_plan_title, 80),
    reading_plan_desc: trim(body.reading_plan_desc, 300),
  });

  res.json({ ok: true, settings: saved });
});

export default router;
