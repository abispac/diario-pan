// ================================================================
// get-google-token.js - one-time helper to get the Drive refresh
// token. Run it ONCE, on your own computer, like this:
//
//   cd server
//   npm install
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run get-google-token
//
// It prints a URL. Open it, log in with the Google account that
// has the 2TB Drive plan, approve, and paste the code back here.
// The script prints the refresh token -> copy it into .env as
// GOOGLE_REFRESH_TOKEN. That's it, forever (unless you revoke it).
// ================================================================

import { google } from "googleapis";
import readline from "node:readline";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first, e.g.:\n" +
      "  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npm run get-google-token"
  );
  process.exit(1);
}

// "urn:ietf:wg:oauth:2.0:oob" is deprecated; the modern flow for
// a command-line script is a loopback redirect, but the simplest
// portable option is the "paste the code" flow against the OAuth
// playground-style redirect. We use the standard installed-app
// loopback URI which Google still supports for Desktop clients.
const oauth2 = new google.auth.OAuth2(
  clientId,
  clientSecret,
  "http://localhost" // Desktop-app clients accept a bare localhost redirect
);

// We ask ONLY for drive.file scope: the token can see and manage
// files this app created - it can NOT read the rest of the Drive.
// Least privilege, in case the token ever leaks.
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline", // this is what makes Google issue a refresh token
  prompt: "consent", // force a fresh refresh token even on re-runs
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log(
  "\n2. Log in with the Google account that owns the 2TB Drive.\n" +
    "3. Approve access. The browser will land on a localhost page\n" +
    "   that fails to load - THAT IS NORMAL. Copy the 'code=' value\n" +
    "   from the address bar (everything between 'code=' and '&').\n"
);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("4. Paste the code here: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2.getToken(decodeURIComponent(code.trim()));
    console.log("\n✅ Success! Add this line to server/.env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    console.error("\n❌ Could not exchange the code:", err.message);
    console.error("Double-check the code and try again.");
  }
});
