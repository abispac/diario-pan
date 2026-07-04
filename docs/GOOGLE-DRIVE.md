# Connecting Google Drive (one-time setup)

The server stores a backup copy of every video in the church's Google
Drive (the 2TB plan). To let the server do that, Google needs to know
the server is allowed. This takes ~15 minutes, once, ever.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in **with the
   Google account that has the 2TB Drive**.
2. Top bar → project selector → **New Project** → name it
   `diario-pan` → Create.

## 2. Enable the Drive API

1. Menu → **APIs & Services → Library**.
2. Search **"Google Drive API"** → open it → **Enable**.

## 3. Create OAuth credentials

1. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Fill only the required fields (app name `Diario Pan`, your email).
   - Add your own Google account as a **Test user**. Save.
     *(Staying in "Testing" mode is fine — only your account uses it.)*
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**, name `diario-pan-server`.
   - Copy the **Client ID** and **Client Secret**.

> Note: while the consent screen is in "Testing" mode Google may expire
> refresh tokens after 7 days. To make the token permanent, publish the
> consent screen (**OAuth consent screen → Publish app**) — you don't
> need Google's verification for a private tool with `drive.file` scope;
> the login just shows an "unverified" warning you can click through.

## 4. Get the refresh token

On your own computer:

```bash
cd server
npm install
GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret npm run get-google-token
```

Follow the printed steps (log in, approve, paste the code back). The
script prints the `GOOGLE_REFRESH_TOKEN` line — copy it into
`server/.env`.

The token only grants access to files **this app creates**
(`drive.file` scope) — it cannot read the rest of the Drive.

## 5. Create the videos folder

1. In Google Drive, create a folder, e.g. **"Diario Pan Videos"**.
2. Open it; the URL looks like
   `https://drive.google.com/drive/folders/1AbCdEfGh...`
3. Copy the part after `/folders/` into `.env` as
   `GOOGLE_DRIVE_FOLDER_ID`.

## Done

`server/.env` should now have all four Google values filled in.
Restart the server and upload a test video — it should appear in the
Drive folder within seconds.
