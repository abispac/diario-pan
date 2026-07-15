// ================================================================
// auth.js - protects the admin area (/upload and the admin API).
//
// Deliberately simple: ONE shared password, known only to the
// uploader and the admin, exactly as requested. After a correct
// login we hand the browser a signed cookie so the uploader does
// not have to retype the password for every single video.
//
// The cookie is "<expiry>.<HMAC(expiry)>". Nobody can forge it
// without SESSION_SECRET, it contains no personal data, and it
// stops working after 30 days even if stolen.
//
// Forgot the password? There is no reset flow on purpose (nothing
// to attack). The admin just edits ADMIN_PASSWORD in server/.env
// and restarts the server.
// ================================================================

import crypto from "node:crypto";
import { config } from "./config.js";

const COOKIE_NAME = "dp_admin";
const SESSION_DAYS = 30;

// ----------------------------------------------------------------
// Login rate limiting (in-memory, per IP): 5 attempts per 15 min.
// Enough for a human who mistypes, hopeless for a brute-forcer.
// ----------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map(); // ip -> { count, windowStart }

function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

// Forget stale entries so the map never grows without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now - entry.windowStart > WINDOW_MS) attempts.delete(ip);
  }
}, WINDOW_MS).unref();

// Sign an expiry timestamp. The cookie is valid only until then.
function sign(expiresAt) {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(`admin-session:${expiresAt}`)
    .digest("hex");
}

function makeCookieValue() {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expiresAt}.${sign(expiresAt)}`;
}

function isValidCookie(value) {
  const [expiresAt, signature] = String(value).split(".");
  if (!expiresAt || !signature) return false;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return false;
  return safeEqual(signature, sign(expiresAt));
}

// Constant-time string comparison. A naive `a === b` can leak
// information through how long the comparison takes. To avoid
// leaking even the LENGTH of the secret, we compare HMACs of the
// two values (always the same length) instead of the raw strings.
function safeEqual(a, b) {
  const key = crypto.randomBytes(32);
  const hmacA = crypto.createHmac("sha256", key).update(String(a)).digest();
  const hmacB = crypto.createHmac("sha256", key).update(String(b)).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

// POST /api/admin/login handler.
export function handleLogin(req, res) {
  if (tooManyAttempts(req.ip)) {
    return res
      .status(429)
      .json({ error: "Demasiados intentos. Espera 15 minutos." });
  }
  const { password } = req.body || {};
  if (!password || !safeEqual(password, config.adminPassword)) {
    // Same message whether the password was wrong or missing -
    // no hints for guessers.
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  // Correct password: clear the rate-limit slate and set the cookie.
  attempts.delete(req.ip);
  res.cookie(COOKIE_NAME, makeCookieValue(), {
    httpOnly: true, // JavaScript on the page cannot read it
    sameSite: "strict", // never sent from other sites (CSRF defense)
    secure: process.env.NODE_ENV === "production", // HTTPS-only in prod
    // 30 days - the uploader logs in about once a month.
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
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
  if (cookie && isValidCookie(cookie)) {
    return next(); // valid session, carry on
  }
  res.status(401).json({ error: "No autorizado" });
}

// Non-throwing variant for routes that are public but behave
// differently for the admin (e.g. previewing scheduled videos).
export function isAdmin(req) {
  const cookie = req.cookies?.[COOKIE_NAME];
  return Boolean(cookie && isValidCookie(cookie));
}
