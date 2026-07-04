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

// ---- Pretty URLs for the two pages ----
app.get("/upload", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "upload.html"))
);
app.get("/descargar", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "descargar.html"))
);

// The QR page needs the store links; serve them as a tiny JSON.
app.get("/api/store-links", (req, res) => res.json(config.storeUrls));

// Simple health check - handy for uptime monitors.
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---- Go ----
app.listen(config.port, () => {
  console.log(`[server] Diario Pan escuchando en el puerto ${config.port}`);
  console.log(`[server] Página de subida:  http://localhost:${config.port}/upload`);
  console.log(`[server] Página de QR:      http://localhost:${config.port}/descargar`);
  startPushScheduler();
});
