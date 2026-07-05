// ================================================================
// api.js - the app's only line to the server.
//
// The server address is CHANGEABLE AT RUNTIME: Ajustes has an
// "Avanzado" section where you can type a different URL. Why?
// So the exact same TestFlight build can point at a MacBook on
// the living-room WiFi today and at the real Namecheap server on
// Monday - no rebuild, no new upload to Apple. The override is
// saved on the phone; leaving the field empty returns to the
// default below.
// ================================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

// The default server - what every phone uses unless someone typed
// an override in Ajustes -> Avanzado.
//
// ⚠️ TESTING PHASE: currently points at the Cloudflare tunnel to
// Javier's Mac so outside testers can just open the app and go.
// If the tunnel URL changes, edit this line and ship it OTA:
//   cd ~/AppDev/diario-pan/app
//   git add -A && git commit -m "new tunnel" && git push
//   eas update --channel production --message "new tunnel url"
// For the real launch, change it back to: https://diariopan.com
export const DEFAULT_SERVER_URL =
  "https://mac-often-motorola-jon.trycloudflare.com";

// The key under which an override is remembered on the phone.
const KEY_SERVER = "dp_server_url";

// Module-level current value. App.js calls loadServerUrl() once
// at startup so this is always correct before any screen renders.
let serverUrl = DEFAULT_SERVER_URL;

// Read the saved override (if any) into memory. Called once when
// the app launches.
export async function loadServerUrl() {
  const saved = await AsyncStorage.getItem(KEY_SERVER);
  if (saved) serverUrl = saved;
  return serverUrl;
}

// What the rest of the app uses to build URLs.
export function getServerUrl() {
  return serverUrl;
}

// Change the server address (from Ajustes → Avanzado).
// - trims spaces and trailing slashes so "http://x.com/" works
// - an empty value clears the override and returns to the default
export async function setServerUrl(url) {
  const clean = (url || "").trim().replace(/\/+$/, "");
  if (clean) {
    serverUrl = clean;
    await AsyncStorage.setItem(KEY_SERVER, clean);
  } else {
    serverUrl = DEFAULT_SERVER_URL;
    await AsyncStorage.removeItem(KEY_SERVER);
  }
  return serverUrl;
}

// ----------------------------------------------------------------
// The actual API calls
// ----------------------------------------------------------------

// Fetch the list of published videos for the main screen.
// Returns [] on network trouble so the UI can show a friendly
// message instead of crashing.
export async function fetchVideos() {
  try {
    const res = await fetch(`${serverUrl}/api/videos`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// The URL the video player streams from. The server decides
// internally whether the bytes come from its own disk or from
// Google Drive - the app never knows or cares.
export function streamUrl(videoId) {
  return `${serverUrl}/api/videos/${videoId}/stream`;
}

// Where the first-launch welcome video lives.
export function welcomeVideoUrl() {
  return `${serverUrl}/welcome.mp4`;
}

// Tell the server this phone's push token and preferred time.
// Called after the welcome flow and whenever Settings change.
export async function registerDevice({ pushToken, hour, minute, timezone }) {
  try {
    await fetch(`${serverUrl}/api/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pushToken,
        notifyHour: hour,
        notifyMinute: minute,
        timezone,
      }),
    });
  } catch {
    // Offline right now? No problem - notifications.js re-registers
    // on the next app launch anyway.
  }
}
