// ================================================================
// auth.js - protects the admin area (/upload and the admin API).
//
// Deliberately simple: ONE shared password, known only to the
// uploader and the admin, exactly as requested. After a correct
// login we hand the browser a signed cookie so the uploader does
// not have to retype the password for every single video.
//
// The cookie is an HMAC signature of a fixed string. Nobody can
// forge it without SESSION_SECRET, and it contains no personal
// data at all.
// ================================================================

import crypto from "node:crypto";
import { config } from "./config.js";

const COOKIE_NAME = "dp_admin";

// The value we put in the cookie: HMAC-SHA256("admin-session")
// keyed with the session secret. Deterministic, unforgeable.
function expectedCookieValue() {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update("admin-session")
    .digest("hex");
}

// Constant-time string comparison. A naive `a === b` can leak
// information through how long the comparison takes; this way
// every comparison takes the same time regardless of the input.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// POST /api/admin/login handler.
export function handleLogin(req, res) {
  const { password } = req.body || {};
  if (!password || !safeEqual(password, config.adminPassword)) {
    // Same message whether the password was wrong or missing -
    // no hints for guessers.
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  // Correct password: set the signed session cookie.
  res.cookie(COOKIE_NAME, expectedCookieValue(), {
    httpOnly: true, // JavaScript on the page cannot read it
    sameSite: "strict", // never sent from other sites (CSRF defense)
    // 30 days - the uploader logs in about once a month.
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
}

// POST /api/admin/logout handler.
export function handleLogout(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
}

// Express middleware: put this in front of any route that only
// the admin/uploader may use.
export function requireAdmin(req, res, next) {
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie && safeEqual(cookie, expectedCookieValue())) {
    return next(); // valid session, carry on
  }
  res.status(401).json({ error: "No autorizado" });
}
