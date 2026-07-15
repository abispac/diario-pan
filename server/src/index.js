// ================================================================
// index.js - the front door. Wires everything together:
//
//   /upload            -> admin page (password-protected client side)
//   /descargar         -> public page with the QR codes
//   /api/videos/...    -> video API (see routes/videos.js)
//   /api/devices/...   -> notification registration
//   /api/admin/...     -> login/logout
//
// Run with:  npm start   (after filling in server/.env)
// ================================================================

import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { handleLogin, handleLogout, requireAdmin } from "./auth.js";
import videosRouter from "./routes/videos.js";
import devicesRouter from "./routes/devices.js";
import { startPushScheduler } from "./push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// We run behind the host's proxy (Namecheap/cPanel). This makes
// req.ip the real visitor IP (needed for login rate limiting) and
// lets the "secure" cookie flag work behind HTTPS termination.
app.set("trust proxy", 1);
// Never leak stack traces in error responses.
app.set("env", process.env.NODE_ENV || "production");

// Parse JSON bodies (small ones - the video upload itself goes
// through multer, not through this).
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Static files: the upload page, the download/QR page, logo, etc.
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- Admin session ----
app.post("/api/admin/login", handleLogin);
app.post("/api/admin/logout", handleLogout);
// The upload page calls this on load to know whether to show the
// login form or go straight to the upload form.
app.get("/api/admin/check", requireAdmin, (req, res) => res.json({ ok: true }));

// ---- The two APIs ----
app.use("/api/videos", videosRouter);
app.use("/api/devices", devicesRouter);

// ---- Pretty URLs for the pages ----
// (the home page, public/index.html, is served automatically
//  at "/" by express.static above)
const page = (name) => (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", `${name}.html`));
app.get("/upload", page("upload"));         // admin: upload the daily video
app.get("/descargar", page("descargar"));   // public: QR codes for the apps
app.get("/privacidad", page("privacidad")); // required by Apple & Google
app.get("/soporte", page("soporte"));       // required by Apple ("Support URL")

// The QR page needs the store links; serve them as a tiny JSON.
app.get("/api/store-links", (req, res) => res.json(config.storeUrls));

// ---- The ONE smart download link: diariopan.com/app ----
// Reads the visitor's device from the User-Agent header and sends
// them straight to the right store. Anything that isn't a phone
// (laptops, tablets we can't identify) lands on the QR page.
// This is the single link to print, share on WhatsApp, etc.
app.get("/app", (req, res) => {
  const ua = String(req.headers["user-agent"] || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return res.redirect(config.storeUrls.ios);
  if (/Android/i.test(ua)) return res.redirect(config.storeUrls.android);
  res.redirect("/descargar");
});

// Simple health check - handy for uptime monitors.
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---- Last-resort error handler ----
// Turns any uncaught route error (e.g. multer "file too large")
// into clean JSON instead of Express's default HTML stack trace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "El archivo es demasiado grande" });
  }
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ---- Go ----
app.listen(config.port, () => {
  console.log(`[server] Diario Pan escuchando en el puerto ${config.port}`);
  console.log(`[server] Página de subida:  http://localhost:${config.port}/upload`);
  console.log(`[server] Página de QR:      http://localhost:${config.port}/descargar`);
  startPushScheduler();
});
