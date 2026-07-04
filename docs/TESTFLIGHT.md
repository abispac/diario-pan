# TestFlight via Xcode (no EAS build quota used)

Plan: build the iOS app locally with Xcode, upload to TestFlight,
point it at the MacBook for the weekend test, then switch it to the
real server on Monday **without rebuilding** (the server address is
changeable inside the app: Ajustes → 🔧 Avanzado).

## Prerequisites (one time)

- Xcode installed (App Store, free) and opened once to accept licenses
- Apple Developer account ($99/yr) signed into Xcode
  (Xcode → Settings → Accounts)
- CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`)
- A free Expo account — needed only for the push notification service,
  NOT for building:

```bash
cd app
npm install
npm install -g eas-cli
eas login
eas init            # free; writes the real projectId into app.json
```

## Push notification credentials (free, no build quota)

Expo's push service needs an APNs key to deliver to iPhones:

```bash
eas credentials -p ios
# choose: production → Push Notifications → set up a new key
# (eas talks to your Apple account and does everything)
```

This uses zero build quota. The **local daily notification** (the
"alarm" layer) needs none of this — it works even before this step.

## Build & upload with Xcode

```bash
cd app
npx expo prebuild -p ios     # generates the native ios/ project
open ios/DiarioPan.xcworkspace
```

In Xcode:

1. Select the **DiarioPan** target → *Signing & Capabilities* → pick
   your **Team**. Check that **Push Notifications** and **Background
   Modes → Remote notifications** capabilities are present (prebuild
   adds them; add manually if missing).
2. Top bar device selector: **Any iOS Device (arm64)**.
3. **Product → Archive**, then in the Organizer window:
   **Distribute App → TestFlight & App Store → Upload**.
4. In [App Store Connect](https://appstoreconnect.apple.com) →
   TestFlight: wait for processing (~15 min), add yourself as an
   internal tester, install via the TestFlight app on your phone.

## Point the app at the MacBook

The Mac and the iPhone must be on the **same WiFi**.

```bash
# on the Mac - find its address on the WiFi:
ipconfig getifaddr en0        # e.g. 192.168.1.34

# make sure the server is running:
cd ~/AppDev/diario-pan/server && npm start
```

On the iPhone: open the app → ⚙️ Ajustes → **🔧 Avanzado** → type
`http://192.168.1.34:3000` (your Mac's address) → done. The video
list, playback, uploads — everything now comes from the Mac.

> Mac tips for a weekend of testing: System Settings → keep the Mac
> from sleeping (Lock Screen → never on power adapter), and if macOS
> firewall prompts about Node accepting connections, click Allow.
> The Mac's IP can change if the router restarts — re-check with
> `ipconfig getifaddr en0`.

### Optional: test away from home

A free Cloudflare tunnel gives the Mac a temporary public https URL:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
# prints e.g. https://random-words.trycloudflare.com
```

Put that URL in Ajustes → Avanzado instead. (It changes each time
the tunnel restarts — fine for testing.)

## Testing the notification + alarm

1. In the app, set the notification time to 2–3 minutes from now.
2. Upload a video for **today** at `http://localhost:3000/upload`
   (or from the phone at `http://<mac-ip>:3000/upload`).
3. Lock the phone. At the chosen minute you should get the
   notification with sound — that's the server push. The local
   daily "alarm" notification fires at the same chosen time every
   day even with the server off.
4. Tap the notification → the app should open straight to the video.

## Monday: switch to the real server

No rebuild needed. Once Namecheap is live with https:

- On each tester's phone: Ajustes → Avanzado → clear the field
  (empty = official server), or type the real URL.
- For the final App Store release: set `DEFAULT_SERVER_URL` in
  `app/src/api.js` to the real domain, remove the
  `NSAppTransportSecurity` block from `app.json` (it was only for
  plain-http testing), and do the store build via
  `eas build -p ios` or Xcode again.
