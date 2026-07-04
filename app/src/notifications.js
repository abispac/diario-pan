// ================================================================
// notifications.js - the "wake me at MY time" machinery.
//
// Two layers work together so the user always gets their daily
// reminder at the hour THEY chose:
//
//  LAYER 1 - Server push (the smart one).
//    We send the phone's push token + chosen time to the server.
//    When a new video is published, the server pushes to each
//    phone at that phone's chosen local time. Arrives even if the
//    app has been closed for weeks.
//
//  LAYER 2 - Local daily notification (the safety net).
//    The phone ALSO schedules its own repeating daily notification
//    at the chosen time ("Tu Diario Pan te espera 🍞"). If the
//    server is ever down or push delivery hiccups, this still
//    fires - it works completely offline, like an alarm clock.
//
// The user experiences ONE reliable daily reminder. (If both
// layers fire the same minute the OS shows them together; in
// practice iOS/Android collapse same-app notifications neatly.)
// ================================================================

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { registerDevice } from "./api";

// How notifications behave while the app is OPEN on screen:
// show them anyway (banner + sound), so the "alarm" experience
// is consistent.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true, // the sound is the user's "alarm"
    shouldSetBadge: false,
  }),
});

// Keys under which we remember the user's choices on the phone.
const KEY_HOUR = "dp_notify_hour";
const KEY_MINUTE = "dp_notify_minute";
const KEY_WELCOMED = "dp_welcomed"; // "yes" once the welcome flow finished

// ----------------------------------------------------------------
// Permissions + push token
// ----------------------------------------------------------------

// Ask the OS for notification permission and get this phone's
// Expo push token. Returns null on simulators or if the user
// says no - the app still works, just without reminders.
export async function getPushToken() {
  if (!Device.isDevice) return null; // simulators can't receive push

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return null;

  // Android additionally needs "channels" - they define the
  // sound/importance of our reminders. Two channels:
  //   devocional        -> normal notification, default sound
  //   devocional-alarma -> alarm mode: church bell, max priority,
  //                        plays on the ALARM audio stream (so it
  //                        uses the alarm volume, not media volume)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("devocional", {
      name: "Devocional diario",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("devocional-alarma", {
      name: "Devocional (modo alarma)",
      importance: Notifications.AndroidImportance.MAX,
      sound: "campana.wav", // bundled bell sound (assets/campana.wav)
      bypassDnd: true, // ring through Do-Not-Disturb where allowed
      audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
    });
  }

  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------
// The single entry point the screens use:
// setNotificationTime(hour, minute)
//   1. saves the choice on the phone
//   2. re-schedules the local daily notification (layer 2)
//   3. tells the server (layer 1)
// ----------------------------------------------------------------
export async function setNotificationTime(hour, minute) {
  // 1. Remember locally.
  await AsyncStorage.multiSet([
    [KEY_HOUR, String(hour)],
    [KEY_MINUTE, String(minute)],
  ]);

  // Alarm mode changes the sound and urgency of the reminder.
  const alarm = await getAlarmMode();

  // 2. Replace any previous local schedule with the new time.
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🍞 Diario Pan",
      body: alarm
        ? "⏰ ¡Es la hora de tu devocional!"
        : "Tu devocional de hoy te está esperando.",
      // Alarm mode: the church-bell sound (11s of bell tolls).
      // Normal mode: the phone's standard notification sound.
      sound: alarm ? "campana.wav" : "default",
      // iOS: "timeSensitive" lets the alert break through Focus
      // modes (requires the entitlement set in app.json).
      interruptionLevel: alarm ? "timeSensitive" : undefined,
    },
    trigger: {
      // Repeats every day at hour:minute, phone-local time.
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: alarm ? "devocional-alarma" : "devocional",
    },
  });

  // 3. Tell the server so the push (layer 1) uses the same time.
  const pushToken = await getPushToken();
  if (pushToken) {
    await registerDevice({
      pushToken,
      hour,
      minute,
      // The phone's IANA timezone, e.g. "America/Chicago". The
      // server uses it to convert "9am for this user" correctly.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }
}

// ----------------------------------------------------------------
// Alarm mode ("⏰ Modo alarma"): louder, more insistent reminder.
// The preference is stored on the phone; changing it re-schedules
// the daily notification with the right sound/urgency.
// ----------------------------------------------------------------
const KEY_ALARM = "dp_alarm_mode";

export async function getAlarmMode() {
  return (await AsyncStorage.getItem(KEY_ALARM)) === "yes";
}

// Save the preference WITHOUT rescheduling (used by the welcome
// flow, which calls setNotificationTime right after anyway).
export async function setAlarmPreference(enabled) {
  await AsyncStorage.setItem(KEY_ALARM, enabled ? "yes" : "no");
}

// Save the preference AND reschedule (used by the Settings toggle).
export async function setAlarmMode(enabled) {
  await setAlarmPreference(enabled);
  const { hour, minute } = await getNotificationTime();
  await setNotificationTime(hour, minute);
}

// Read the saved time (defaults to 8:00 for brand-new installs).
export async function getNotificationTime() {
  const hour = await AsyncStorage.getItem(KEY_HOUR);
  const minute = await AsyncStorage.getItem(KEY_MINUTE);
  return {
    hour: hour !== null ? Number(hour) : 8,
    minute: minute !== null ? Number(minute) : 0,
  };
}

// ----------------------------------------------------------------
// Welcome-flow bookkeeping: has this phone already seen the
// presentation video and picked a time?
// ----------------------------------------------------------------
export async function hasCompletedWelcome() {
  return (await AsyncStorage.getItem(KEY_WELCOMED)) === "yes";
}

export async function markWelcomeCompleted() {
  await AsyncStorage.setItem(KEY_WELCOMED, "yes");
}
