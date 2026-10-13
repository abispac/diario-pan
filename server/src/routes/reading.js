// ================================================================
// routes/reading.js - the monthly reading plan.
//
// Public (the website and the app):
//   GET  /api/reading/today      -> { date, base } or { base: null }
//
// Admin (needs the session cookie from /upload):
//   POST /api/reading/preview    -> upload a PDF, get back what was
//                                   read, WITHOUT saving anything
//   POST /api/reading/publish    -> commit the previewed month
//   GET  /api/reading/months     -> which months are loaded
//
// Two steps on purpose: a month of readings goes out to the whole
// church, so the uploader sees the 31 days before anything is kept.
// ================================================================

import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { extractPlan } from "../reading-plan.js";
import { replaceMonthReadings, getReadingForDate, listReadingMonths, saveSettings } from "../db.js";
import { requireAdmin } from "../auth.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planDir = path.join(__dirname, "..", "..", "storage", "plan");
fs.mkdirSync(planDir, { recursive: true });

const MONTHS = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

// A reading-plan PDF is a few hundred kilobytes; 20MB is generous.
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Previews waiting to be published. Kept in memory on purpose:
// if the server restarts mid-review the admin simply uploads
// again, and nothing half-saved is left behind.
const pending = new Map();
const PENDING_MS = 30 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (now - entry.at > PENDING_MS) {
      fs.promises.unlink(entry.tmpPath).catch(() => {});
      pending.delete(token);
    }
  }
}
setInterval(sweep, PENDING_MS).unref();

// Today in SERVER-LOCAL time, as YYYY-MM-DD. "en-CA" formats that
// way natively; this matches how videos decide their publish date.
function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

// ----------------------------------------------------------------
// GET /api/reading/today - what the site and the app show.
// ----------------------------------------------------------------
router.get("/today", (req, res) => {
  const date = todayIso();
  const row = getReadingForDate(date);
  res.set("Cache-Control", "public, max-age=300");
  res.json({ date, base: row ? row.base : null });
});

// ----------------------------------------------------------------
// POST /api/reading/preview - read the PDF, keep nothing yet.
// ----------------------------------------------------------------
router.post("/preview", requireAdmin, upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Elige el PDF del mes." });

  try {
    const bytes = new Uint8Array(await fs.promises.readFile(req.file.path));
    const { month, days, problems } = await extractPlan(bytes);

    if (!month) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({
        error: "No se pudo identificar el mes. ¿Es el PDF del plan de lectura?",
        problems,
      });
    }
    if (!days.length) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({
        error: "No se encontró la tabla de lecturas dentro del PDF.",
        problems,
      });
    }

    // Which calendar month is this? The PDF names the month but not
    // the year, so assume the nearest sensible one: this year, unless
    // that is more than six months in the past, in which case next.
    const now = new Date();
    const m = MONTHS[month];
    let year = now.getFullYear();
    const monthsBehind = (now.getFullYear() * 12 + now.getMonth() + 1) - (year * 12 + m);
    if (monthsBehind > 6) year += 1;
    const monthKey = `${year}-${String(m).padStart(2, "0")}`;

    const token = crypto.randomBytes(16).toString("hex");
    pending.set(token, {
      at: Date.now(),
      monthKey,
      month,
      days,
      tmpPath: req.file.path,
      originalName: req.file.originalname,
    });

    res.json({ ok: true, token, month, monthKey, days, problems });
  } catch (err) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    console.error("[reading] preview failed:", err);
    res.status(500).json({ error: "No se pudo leer el PDF." });
  }
});

// ----------------------------------------------------------------
// POST /api/reading/publish - commit what was previewed.
// ----------------------------------------------------------------
router.post("/publish", requireAdmin, async (req, res) => {
  const entry = pending.get(String(req.body?.token || ""));
  if (!entry) {
    return res.status(410).json({
      error: "La vista previa expiró. Vuelve a subir el PDF.",
    });
  }

  try {
    // Keep the PDF so the Plan de Lectura card can point at our own
    // server instead of depending on a Google Drive link.
    const dest = path.join(planDir, `${entry.monthKey}.pdf`);
    await fs.promises.copyFile(entry.tmpPath, dest);
    await fs.promises.copyFile(entry.tmpPath, path.join(planDir, "actual.pdf"));
    await fs.promises.unlink(entry.tmpPath).catch(() => {});

    const saved = replaceMonthReadings(entry.monthKey, entry.days);

    // Point the card at the PDF we now host ourselves.
    saveSettings({ reading_plan_url: "https://www.diariopan.com/plan.pdf" });

    pending.delete(req.body.token);
    res.json({ ok: true, monthKey: entry.monthKey, month: entry.month, saved });
  } catch (err) {
    console.error("[reading] publish failed:", err);
    res.status(500).json({ error: "No se pudo guardar el plan." });
  }
});

// ----------------------------------------------------------------
// GET /api/reading/months - what is loaded, for the admin page.
// ----------------------------------------------------------------
router.get("/months", requireAdmin, (req, res) => {
  res.json(listReadingMonths());
});

export { planDir };
export default router;
