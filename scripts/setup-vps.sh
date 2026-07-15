#!/usr/bin/env bash
# ================================================================
# setup-vps.sh - one-shot production setup for diariopan.com
#
# Target: a FRESH Ubuntu 22.04/24.04 VPS, run as root.
# Safe to re-run: every step checks before doing.
#
# Usage (on the VPS):
#   curl -fsSL https://raw.githubusercontent.com/abispac/diario-pan/main/scripts/setup-vps.sh | bash
# or copy it over and:  bash setup-vps.sh
# ================================================================
set -euo pipefail

DOMAIN="diariopan.com"
REPO="https://github.com/abispac/diario-pan.git"
APP_DIR="/opt/diario-pan"
TIMEZONE="America/New_York"          # where the congregation lives
CERT_EMAIL="ode1979@gmail.com"       # Let's Encrypt expiry notices

echo "==> [1/9] System update + timezone"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -y -qq
timedatectl set-timezone "$TIMEZONE"

echo "==> [2/9] Swap file (the VPS has 2GB RAM; this prevents OOM kills)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> [3/9] Node.js 20, nginx, certbot, ffmpeg, git"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
fi
apt-get install -y -qq nodejs git nginx certbot python3-certbot-nginx ffmpeg ufw

echo "==> [4/9] yt-dlp (the 'paste a Facebook link' feature)"
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

echo "==> [5/9] Firewall: SSH + web only"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "==> [6/9] Code"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR/server"
npm install --omit=dev --no-audit --no-fund

echo "==> [7/9] Production .env"
if [ ! -f .env ]; then
  ADMIN_PW="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
  cat > .env <<EOF
# Production configuration - created by setup-vps.sh $(date +%F)
PORT=3000

# Password for https://${DOMAIN}/upload (also printed at the end
# of the setup output - save it in a password manager).
ADMIN_PASSWORD=${ADMIN_PW}
SESSION_SECRET=$(openssl rand -hex 32)

# Google Drive - FILL THESE IN (see docs/GOOGLE-DRIVE.md).
# Run "npm run get-google-token" on your Mac and paste the values.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=

# Keep 90 days of videos on this disk (40GB); older ones stream
# from Google Drive automatically.
LOCAL_KEEP_DAYS=90

# Fill in after the apps are live in the stores:
ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.diariopan.app
IOS_STORE_URL=https://apps.apple.com/app/diario-pan/id0000000000
EOF
  chmod 600 .env
  NEW_ENV_CREATED=yes
else
  NEW_ENV_CREATED=no
fi

echo "==> [8/9] pm2 (keeps the server running, restarts on crash/reboot)"
npm install -g pm2 >/dev/null
cat > "$APP_DIR/server/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: "diario-pan",
    script: "src/index.js",
    cwd: "$APP_DIR/server",
    env: { NODE_ENV: "production", TZ: "$TIMEZONE" },
    max_memory_restart: "600M",
  }],
};
EOF
pm2 startOrReload "$APP_DIR/server/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

echo "==> [9/9] nginx + HTTPS"
cat > /etc/nginx/sites-available/diariopan <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    # allow big video uploads through nginx
    client_max_body_size 2G;
    # uploads and Drive streams can be slow - don't cut them off
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # don't buffer video streams - pass bytes through live
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
EOF
ln -sf /etc/nginx/sites-available/diariopan /etc/nginx/sites-enabled/diariopan
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# HTTPS cert. Needs the DNS A record for ${DOMAIN} pointing at this
# machine already. Tries apex+www, falls back to apex only.
if certbot --nginx --non-interactive --agree-tos -m "$CERT_EMAIL" \
     --redirect -d "$DOMAIN" -d "www.$DOMAIN" 2>/dev/null \
   || certbot --nginx --non-interactive --agree-tos -m "$CERT_EMAIL" \
     --redirect -d "$DOMAIN"; then
  HTTPS_OK=yes
else
  HTTPS_OK=no
fi

echo
echo "================================================================"
echo " DONE. Summary:"
echo "================================================================"
if [ "$NEW_ENV_CREATED" = yes ]; then
  echo " Upload page password (SAVE THIS):  $ADMIN_PW"
  echo "   -> https://${DOMAIN}/upload"
fi
if [ "$HTTPS_OK" = no ]; then
  echo " ⚠ HTTPS failed - the DNS A record probably hasn't propagated."
  echo "   Fix DNS, wait a bit, then run:"
  echo "   certbot --nginx --redirect -d $DOMAIN -d www.$DOMAIN -m $CERT_EMAIL --agree-tos"
fi
echo
echo " Still to do:"
echo "  1. Google Drive credentials -> nano $APP_DIR/server/.env"
echo "     then: pm2 restart diario-pan"
echo "  2. Welcome video -> $APP_DIR/server/public/welcome.mp4"
echo "  3. Test: https://${DOMAIN}/api/health"
echo "================================================================"
