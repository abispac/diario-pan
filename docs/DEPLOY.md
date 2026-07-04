# Deployment guide

## A. The server

### What kind of hosting do you need?

The server is a **Node.js** app. Important: Namecheap's cheap *shared*
hosting (Stellar) is built for PHP sites and does not run Node apps
well. Two good options:

1. **Namecheap VPS** (e.g. "Pulsar", ~$7/mo) — full control, plenty of
   disk for the local video copies. Recommended since you're buying
   Namecheap anyway: buy the **domain** there and a small **VPS** there.
2. Any other small VPS (DigitalOcean, Hetzner, etc.) — same steps.

### Steps (Ubuntu VPS)

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Get the code
git clone https://github.com/YOUR-USER/diario-pan.git
cd diario-pan/server
npm install

# 3. Configure
cp .env.example .env
nano .env        # fill in every value (see GOOGLE-DRIVE.md)

# 4. Keep it running forever (restarts on crash and on reboot)
sudo npm install -g pm2
pm2 start src/index.js --name diario-pan
pm2 save && pm2 startup

# 5. Put nginx + free HTTPS in front
sudo apt-get install -y nginx certbot python3-certbot-nginx
# point nginx at localhost:3000 for diariopan.com, then:
sudo certbot --nginx -d diariopan.com
```

Minimal nginx site config (`/etc/nginx/sites-available/diariopan`):

```nginx
server {
    server_name diariopan.com;
    # allow big video uploads through nginx
    client_max_body_size 2G;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        # don't buffer video streams - pass bytes through live
        proxy_buffering off;
    }
}
```

Point the domain's DNS **A record** at the VPS IP (in the Namecheap
dashboard).

### Disk space for local copies

Daily videos add up. If the VPS disk is small, set in `.env`:

```
LOCAL_KEEP_DAYS=90
```

→ the server keeps the last 90 days on its own disk and serves anything
older from Google Drive automatically. Nothing is ever lost.

## B. The apps (one codebase → both stores)

You need: an **Apple Developer account** ($99/yr) and a **Google Play
Console account** ($25 once). Then, from `app/`:

```bash
npm install -g eas-cli
eas login                      # free Expo account
eas init                       # writes the real projectId into app.json
# Edit src/api.js -> SERVER_URL = "https://diariopan.com"
# Add real icon.png / splash.png (see app/assets/README.md)

eas build --platform android   # produces the .aab for Google Play
eas build --platform ios       # produces the build for App Store
eas submit --platform android
eas submit --platform ios
```

Push notifications work out of the box on Android. For iOS, EAS walks
you through generating the push key the first time you build — say yes
to everything.

Once both apps are live, put the store URLs into `server/.env`
(`ANDROID_STORE_URL`, `IOS_STORE_URL`) and restart — the QR codes on
`/descargar` update automatically. Print that page for the church. 🎉

## C. The welcome video

Record the short presentation video (what the app is, how to pick your
hour) and upload it as `server/public/welcome.mp4`. The app plays it
automatically on first launch.
