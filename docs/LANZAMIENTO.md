# Launch checklist — diariopan.com + App Store + Google Play

Status after the July 2026 code review. Work through this top to bottom;
each unchecked box is something only you (Javier) can do.

## What the review already fixed (nothing to do, just FYI)

Server: login rate limiting (5 tries / 15 min per IP), session cookie now
expires and is HTTPS-only in production, video streams no longer can crash
the whole server on a read error (and the local→Drive failover actually
works now), HTTP Range handling fixed for iOS players (suffix ranges,
clamping, 416), scheduled videos can no longer be watched early by guessing
IDs, upload MIME whitelist, device registration validates real Expo tokens
and timezones, the nightly job no longer cancels notifications for users in
western timezones, failed Google Drive uploads are retried nightly, multer
upgraded to 2.x (security fixes — run `npm install` in `server/`).

App: default server is now `https://diariopan.com`, the iOS "allow plain
http" exception is gone, duplicate/problematic Android permissions removed
(`SCHEDULE_EXACT_ALARM` dropped — it required a special Play declaration),
tapping a notification now opens the video even when the app was fully
closed, the app re-registers with the server on every launch so timezone
changes are picked up, the server-address field in Ajustes is hidden in
store builds, "no internet" and "no videos yet" now show different
messages, video audio stops when leaving the player.

Also deleted `app/sta/` (a stray arcade-emulator save file — nothing to do
with the project).

## 1. Server on diariopan.com

⚠️ **Hosting type matters.** If "Namecheap hosting" means the shared
Stellar plan: it cannot run this. Node runs poorly there, the once-a-minute
push scheduler dies when the host idles the process, and `yt-dlp` (the
"paste a Facebook link" feature) can't be installed. You need the
**Namecheap VPS** (Pulsar, ~$7/mo) or any small VPS. Full commands are in
`docs/DEPLOY.md` — they are still correct.

- [ ] Buy/spin up the VPS; point the diariopan.com **A record** at its IP
- [ ] Follow DEPLOY.md section A (Node 20+, yt-dlp, ffmpeg, pm2, nginx, certbot)
- [ ] Create the production `server/.env` — do NOT copy your Mac's .env:
  - `ADMIN_PASSWORD` — long and random (your current local one is `123456`; never use that in production)
  - `SESSION_SECRET` — new random 64-char string (`openssl rand -hex 32` makes both)
  - Real Google credentials (docs/GOOGLE-DRIVE.md) — locally they're dummies
  - `LOCAL_KEEP_DAYS=90` (or whatever the disk allows)
- [ ] Also set in the pm2 environment: `NODE_ENV=production` and
      `TZ=America/New_York` (or wherever the congregation is — the
      publish-date logic uses server-local time)
- [x] ~~Welcome video~~ — removed from the app entirely; first launch now
      goes straight to the time picker (simpler, and nothing to record)
- [ ] Verify `contacto@diariopan.com` exists and is monitored (it's on the
      privacy + support pages; Apple checks these)
- [ ] Fix the footer link in `server/public/index.html` — it points at bare
      `github.com` instead of your repo
- [ ] Smoke test: `https://diariopan.com/api/health`, `/upload` (login,
      upload a video), `/privacidad`, `/soporte`, `/descargar`, and play a
      video in the TestFlight app

## 2. Rebuild the app (required — OTA is not enough)

`app.json` changed (ATS removed, permissions cleaned), and native config
only takes effect in a new binary:

```bash
cd app
eas build --platform ios
eas build --platform android
```

Nice-to-have before building (cosmetic, not blocking):

- [ ] Android adaptive icon: `assets/icon.png` is full-bleed and gets
      cropped by the round mask — make a dedicated foreground image with
      the bread confined to the central ~66%
- [ ] Android notification icon: add a 96×96 white-on-transparent glyph and
      reference it as `"icon"` in the expo-notifications plugin config
      (right now status-bar notifications show a generic shape)

## 3. Apple App Store

- [ ] App Store Connect → your app → App Privacy:
  - Privacy Policy URL: `https://diariopan.com/privacidad`
  - Data collected: **Identifiers → Device ID** (the push token) — purpose
    App Functionality, **not** linked to identity, **not** used for tracking
  - That's the only collected data type to declare
- [ ] Support URL: `https://diariopan.com/soporte`
- [ ] Screenshots (6.7" and 6.5" iPhone; iPad only if you keep
      `supportsTablet: true` — screenshots for iPad are then required)
- [ ] Spanish (Mexico or Spain) as primary locale; description, keywords
- [ ] Age rating questionnaire (all "none" → 4+)
- [ ] `eas submit --platform ios`, pick the new build, submit for review
- [ ] Review notes: mention it's a church's daily devotional app, no
      account needed — helps the reviewer test in 2 minutes

## 4. Google Play

- [ ] Play Console → Data Safety form:
  - Collects: Device or other IDs (push token); App info/other (chosen
    notification time + timezone)
  - Shared with third parties: No. Encrypted in transit: Yes.
    Deletion: users can email contacto@diariopan.com (also: turning
    notifications off in Ajustes deletes the token server-side)
- [ ] Privacy policy URL: `https://diariopan.com/privacidad`
- [ ] Store listing (Spanish), screenshots, feature graphic 1024×500
- [ ] Content rating questionnaire (everyone)
- [ ] Target audience: 18+ or "all ages" — pick 18+ unless you want the
      extra child-safety review
- [ ] `eas submit --platform android` (internal testing track first, then
      promote to production)

## 5. After both apps are live

- [ ] Put the real store URLs in the production `.env`
      (`IOS_STORE_URL`, `ANDROID_STORE_URL`) and `pm2 restart diario-pan`
      — the QR page and the smart `/app` link start working
- [ ] Print `/descargar` for the church bulletin board 🎉

## 6. Known items for later (not blocking)

- **Before ~Aug 31, 2026:** Google will require Android API 36 → upgrade to
  Expo SDK 54. That release also removes `expo-av`, so the three `<Video>`
  usages must migrate to `expo-video`. Plan a week for this.
- The iOS time picker "alarm mode" `bypassDnd` promise on Android mostly
  won't hold (needs per-channel DND permission) — fine, just don't
  advertise it as guaranteed.
- Password recovery for /upload: intentionally not built. Reset = edit
  `ADMIN_PASSWORD` in the server `.env` + `pm2 restart diario-pan`.
