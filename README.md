# 🍞 Diario Pan

**Daily devotional videos — without ads, at the hour each person chooses.**

Our church posts a short daily devotional video ("Diario Pan"). Social
platforms started stuffing a 3-minute devotional with up to 4 ads. This
project replaces that experience entirely: our own upload page, our own
storage, our own apps. Just the Word, in peace.

*Español: guía para quien sube los videos en [docs/GUIA-SUBIDOR.md](docs/GUIA-SUBIDOR.md).*

## How it works

```
 Uploader                      Server (Namecheap)                Phones
┌──────────┐   video+date   ┌────────────────────┐   push at   ┌─────────┐
│ /upload  │ ─────────────▶ │ saves 2 copies:    │  user's own │ iPhone/ │
│ web page │                │  1. local disk     │    hour     │ Android │
└──────────┘                │  2. Google Drive   │ ──────────▶ │  app    │
                            │ (backup of each    │             └─────────┘
                            │  other, automatic  │   streams from local
                            │  failover on play) │ ◀──────────  disk, or Drive
                            └────────────────────┘   if local fails
```

* **Upload** — one password-protected page (`/upload`): pick the video,
  pick the date it should appear (today, tomorrow, whenever), press the
  button. Done.
* **Dual storage** — every video is saved on the server's own disk *and*
  in Google Drive (2TB plan). Playback uses the local copy; if it's ever
  missing or unreadable, the server silently streams from Drive instead.
  One source per playback, never both, invisible to the viewer.
* **Personalized notifications** — pastor uploads at 4am, María wants her
  devotional at 9am → her phone stays quiet until 9am *her time*. Two
  layers: server push (Expo, free, iOS+Android) plus a local daily
  notification on the phone as an offline safety net.
* **The app** — first launch plays a welcome video explaining everything,
  then asks one question: "¿A qué hora quieres tu devocional?" After
  that: the list of videos, a player, and Settings (change the time,
  pick a color). Nothing else to learn.
* **QR page** — `/descargar` shows App Store + Google Play QR codes,
  ready to print for the church bulletin board.

## Repository layout

| Folder | What it is |
|--------|-----------|
| `server/` | Node.js backend: upload page, video API, Drive sync, push scheduler |
| `app/` | Expo (React Native) app — one codebase for iPhone **and** Android |
| `docs/` | Setup guides: Google Drive credentials, deployment, uploader guide (Spanish) |

## Quick start (development)

```bash
# --- Server ---
cd server
npm install
cp .env.example .env        # then fill it in (see docs/GOOGLE-DRIVE.md)
npm start                   # http://localhost:3000/upload

# --- App ---
cd ../app
npm install
# Point src/api.js SERVER_URL at your server, then:
npx expo start              # scan the QR with the Expo Go app
```

## Deployment

See [docs/DEPLOY.md](docs/DEPLOY.md) — covers the Namecheap server, the
Google Drive credentials, and publishing the apps to both stores with
Expo EAS.

## Contributing

Pull requests welcome. The code is deliberately simple and heavily
commented — if a change makes it harder for a volunteer to understand,
it's probably the wrong change. Please keep user-facing text in Spanish.

## License

[MIT](LICENSE) — free to use, copy, and adapt for your own congregation.
