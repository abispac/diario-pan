// ================================================================
// api.js - the app's only line to the server.
//
// Change SERVER_URL to wherever the backend is deployed
// (e.g. https://diariopan.com) and everything else follows.
// ================================================================

// ⚠️ CHANGE THIS before building for the stores:
export const SERVER_URL = "https://diariopan.com";

// Fetch the list of published videos for the main screen.
// Returns [] on network trouble so the UI can show a friendly
// message instead of crashing.
export async function fetchVideos() {
  try {
    const res = await fetch(`${SERVER_URL}/api/videos`);
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
  return `${SERVER_URL}/api/videos/${videoId}/stream`;
}

// Tell the server this phone's push token and preferred time.
// Called after the welcome flow and whenever Settings change.
export async function registerDevice({ pushToken, hour, minute, timezone }) {
  try {
    await fetch(`${SERVER_URL}/api/devices`, {
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
