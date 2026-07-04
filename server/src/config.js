// ================================================================
// config.js - one single place where all configuration lives.
//
// Everything secret or environment-specific comes from the .env
// file (loaded by dotenv). The rest of the code imports from here
// so no other file ever touches process.env directly. That makes
// it very easy to see, in one glance, everything the server needs.
// ================================================================

import "dotenv/config";

// Small helper: crash loudly at startup if a required setting is
// missing. A server that starts "half configured" causes confusing
// bugs later; failing early with a clear message is kinder.
function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `[config] Missing required environment variable: ${name}\n` +
        `         Copy server/.env.example to server/.env and fill it in.`
    );
    process.exit(1);
  }
  return value;
}

export const config = {
  // Port the HTTP server listens on.
  port: Number(process.env.PORT) || 3000,

  // Password that protects /upload. Compared with a constant-time
  // check in auth.js to avoid timing attacks.
  adminPassword: required("ADMIN_PASSWORD"),

  // Secret for signing the admin session cookie.
  sessionSecret: required("SESSION_SECRET"),

  // Google Drive OAuth credentials. See docs/GOOGLE-DRIVE.md for
  // how to obtain each one.
  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    refreshToken: required("GOOGLE_REFRESH_TOKEN"),
    folderId: required("GOOGLE_DRIVE_FOLDER_ID"),
  },

  // Store links for the QR download page. Placeholders are OK
  // until the apps are actually published.
  storeUrls: {
    android:
      process.env.ANDROID_STORE_URL ||
      "https://play.google.com/store/apps/details?id=com.diariopan.app",
    ios:
      process.env.IOS_STORE_URL ||
      "https://apps.apple.com/app/diario-pan/id0000000000",
  },
};
