// ================================================================
// push.js - sends the "your devotional is ready" notification.
//
// The heart of the personalized-time feature. The story:
//
//   * The pastor's team uploads a video with a publish date.
//   * Each phone told us what time its owner wants to be notified
//     (e.g. 9:00am) and in which timezone.
//   * Once a minute, this cron job wakes up and asks two things:
//       1. Is there a published video nobody has been told about?
//       2. Which phones' clocks read their chosen time RIGHT NOW?
//     Every phone that matches gets its push notification.
//
// So if the pastor uploads at 4am and Maria chose 9am, Maria's
// phone stays quiet until exactly 9am *her* time. If the video is
// uploaded LATE (after someone's chosen time has already passed
// today), that person is notified immediately - better late than
// never for a daily devotional.
//
// We use Expo's push service, which delivers to both Apple (APNs)
// and Google (FCM) phones for free - one API for both stores.
// ================================================================

import { Expo } from "expo-server-sdk";
import cron from "node-cron";
import {
  listDevices,
  deleteDevice,
  listUnnotifiedPublishedVideos,
  markVideoNotified,
  listAllVideos,
} from "./db.js";
import { pruneOldLocalCopies } from "./storage.js";

const expo = new Expo();

// Per-device memory of "already notified today", so a device is
// never pinged twice for the same day even across multiple videos.
// Lives in RAM: if the server restarts mid-day, worst case someone
// gets a duplicate notification once. Acceptable trade-off for
// simplicity.
const notifiedToday = new Map(); // pushToken -> "YYYY-MM-DD"

// What time is it right now on a phone in the given timezone?
// Returns { hour, minute, dateStr }.
function nowInTimezone(timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return {
      hour: Number(get("hour")) % 24, // Intl can return "24" at midnight
      minute: Number(get("minute")),
      dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    };
  } catch {
    // Unknown timezone string? Fall back to server time rather
    // than crash the whole cron.
    const d = new Date();
    return {
      hour: d.getHours(),
      minute: d.getMinutes(),
      dateStr: d.toISOString().slice(0, 10),
    };
  }
}

// Has this device's chosen notification time already passed today?
function timeHasPassed(device, now) {
  return (
    now.hour > device.notify_hour ||
    (now.hour === device.notify_hour && now.minute >= device.notify_minute)
  );
}

// The once-a-minute check described at the top of the file.
async function tick() {
  // Anything new to announce? (Published, not yet marked notified.)
  const newVideos = listUnnotifiedPublishedVideos();
  if (newVideos.length === 0) return;

  const devices = listDevices();
  const messages = [];

  for (const device of devices) {
    const now = nowInTimezone(device.timezone);

    // Skip if we already pinged this phone today.
    if (notifiedToday.get(device.push_token) === now.dateStr) continue;

    // Notify when the user's chosen moment has arrived (or already
    // passed - covers late uploads).
    if (!timeHasPassed(device, now)) continue;

    // Guard against tokens that were corrupted somewhere along the way.
    if (!Expo.isExpoPushToken(device.push_token)) {
      deleteDevice(device.push_token);
      continue;
    }

    messages.push({
      to: device.push_token,
      sound: "default", // plays the phone's notification sound - the "alarm"
      title: "🍞 Diario Pan",
      body: "Tu devocional de hoy está listo. ¡Toca para verlo!",
      data: { videoId: newVideos[0].id }, // app opens straight to the video
      priority: "high",
    });
    notifiedToday.set(device.push_token, now.dateStr);
  }

  // Expo wants messages in chunks of up to 100. Send each chunk
  // and clean up any tokens Expo reports as dead (uninstalled app).
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          deleteDevice(chunk[i].to);
        }
      });
    } catch (err) {
      console.error("[push] Error sending notifications:", err.message);
    }
  }

  // A video stays "unnotified" all day so that devices whose
  // chosen time hasn't arrived yet still get their turn on a
  // later tick. Once every registered device has been notified
  // today, we can close the video out early; otherwise the
  // nightly job below closes it at end of day.
  const everyoneServed =
    devices.length > 0 &&
    devices.every(
      (d) => notifiedToday.get(d.push_token) === nowInTimezone(d.timezone).dateStr
    );
  if (everyoneServed) {
    for (const v of newVideos) markVideoNotified(v.id);
  }
}

// Start the schedulers. Called once from index.js.
export function startPushScheduler() {
  // Every minute: the notification check.
  cron.schedule("* * * * *", () => {
    tick().catch((err) => console.error("[push] tick failed:", err.message));
  });

  // Every night at 3:15am server time: prune old local video
  // copies if LOCAL_KEEP_DAYS is set (see storage.js). Also make
  // sure yesterday's videos are marked done so the "unnotified"
  // list never grows without bound.
  cron.schedule("15 3 * * *", () => {
    try {
      const all = listAllVideos();
      pruneOldLocalCopies(all);
      const today = new Date().toISOString().slice(0, 10);
      for (const v of all) {
        if (!v.notified && v.publish_date < today) markVideoNotified(v.id);
      }
    } catch (err) {
      console.error("[push] nightly job failed:", err.message);
    }
  });

  console.log("[push] Scheduler started (checks every minute).");
}
