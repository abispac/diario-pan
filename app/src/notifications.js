// Daily reminder and push-registration orchestration.
//
// The local notification is the dependable daily alarm. The server push
// announces that a new video is available. Both use the same preference,
// channels and sound so release builds behave consistently.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { registerDevice } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const KEY_HOUR = "dp_notify_hour";
const KEY_MINUTE = "dp_notify_minute";
const KEY_WELCOMED = "dp_welcomed";
const KEY_ALARM = "dp_alarm_mode";
const KEY_SCHEDULE_ID = "dp_daily_schedule_id";
const KEY_SCHEDULE_VERSION = "dp_daily_schedule_version";

// Android notification-channel sound and importance are effectively immutable
// after a channel is first created. Versioned IDs make this corrected setup
// take effect even on phones that installed an earlier build.
export const NORMAL_CHANNEL_ID = "devocional-v2";
export const ALARM_CHANNEL_ID = "devocional-alarma-v2";
const SCHEDULE_VERSION = "2";

let scheduleChain = Promise.resolve();

export async function ensureNotificationChannels() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(NORMAL_CHANNEL_ID, {
    name: "Devocional diario",
    description: "Recordatorio diario de Diario Pan",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 250, 180, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: "Devocional (modo alarma)",
    description: "Campana y prioridad máxima para el recordatorio diario",
    importance: Notifications.AndroidImportance.MAX,
    sound: "campana.wav",
    enableVibrate: true,
    vibrationPattern: [0, 500, 250, 500, 250, 700],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
}

function isPermissionGranted(permission) {
  if (permission?.granted || permission?.status === "granted") return true;
  if (Platform.OS !== "ios") return false;

  const iosStatus = permission?.ios?.status;
  return [
    Notifications.IosAuthorizationStatus.AUTHORIZED,
    Notifications.IosAuthorizationStatus.PROVISIONAL,
    Notifications.IosAuthorizationStatus.EPHEMERAL,
  ].includes(iosStatus);
}

export async function getNotificationPermission({ request = false } = {}) {
  // Android 13 will not show its notification permission prompt until a
  // channel exists, so channel creation must always happen first.
  await ensureNotificationChannels();

  let permission = await Notifications.getPermissionsAsync();
  if (!isPermissionGranted(permission) && request && permission.canAskAgain !== false) {
    permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });
  }

  return {
    granted: isPermissionGranted(permission),
    canAskAgain: permission?.canAskAgain !== false,
    status: permission?.status || "undetermined",
  };
}

export async function getPushToken({ requestPermission = true } = {}) {
  if (!Device.isDevice) return null;

  const permission = await getNotificationPermission({
    request: requestPermission,
  });
  if (!permission.granted) return null;

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    console.warn("Push token unavailable:", error?.message);
    return null;
  }
}

function normalizeTime(hour, minute) {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 23) {
    throw new Error("La hora del recordatorio no es válida.");
  }
  if (!Number.isInteger(m) || m < 0 || m > 59) {
    throw new Error("Los minutos del recordatorio no son válidos.");
  }
  return { hour: h, minute: m };
}

async function removeOwnedDailySchedule({ migration = false } = {}) {
  const scheduleId = await AsyncStorage.getItem(KEY_SCHEDULE_ID);
  if (scheduleId) {
    await Notifications.cancelScheduledNotificationAsync(scheduleId).catch(() => {});
  }

  // Earlier releases did not store their notification identifier. During this
  // one-time migration, clear their orphaned request so it cannot ring beside
  // the corrected schedule.
  if (migration) {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  await AsyncStorage.removeItem(KEY_SCHEDULE_ID);
}

async function scheduleDailyReminder(hour, minute, alarm) {
  const previousVersion = await AsyncStorage.getItem(KEY_SCHEDULE_VERSION);
  await removeOwnedDailySchedule({
    migration: previousVersion !== SCHEDULE_VERSION,
  });

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "🍞 Diario Pan",
      body: alarm
        ? "⏰ ¡Es la hora de tu devocional!"
        : "Tu devocional de hoy te está esperando.",
      sound: alarm ? "campana.wav" : "default",
      interruptionLevel: alarm ? "timeSensitive" : "active",
      data: { kind: "daily-reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: alarm ? ALARM_CHANNEL_ID : NORMAL_CHANNEL_ID,
    },
  });

  await AsyncStorage.multiSet([
    [KEY_SCHEDULE_ID, identifier],
    [KEY_SCHEDULE_VERSION, SCHEDULE_VERSION],
  ]);

  return identifier;
}

async function registerCurrentDevice(hour, minute, alarm, requestPermission) {
  const pushToken = await getPushToken({ requestPermission });
  if (!pushToken) return false;

  return registerDevice({
    pushToken,
    hour,
    minute,
    alarmMode: alarm,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  });
}

async function applyNotificationTime(hour, minute) {
  const normalized = normalizeTime(hour, minute);
  await AsyncStorage.multiSet([
    [KEY_HOUR, String(normalized.hour)],
    [KEY_MINUTE, String(normalized.minute)],
  ]);

  const alarm = await getAlarmMode();
  const permission = await getNotificationPermission({ request: true });
  if (!permission.granted) {
    await removeOwnedDailySchedule();
    return { scheduled: false, ...permission };
  }

  const scheduleId = await scheduleDailyReminder(
    normalized.hour,
    normalized.minute,
    alarm
  );
  const registered = await registerCurrentDevice(
    normalized.hour,
    normalized.minute,
    alarm,
    false
  );

  return {
    scheduled: true,
    registered,
    scheduleId,
    ...permission,
  };
}

// Serialize schedule replacements. This prevents a Settings time change and an
// alarm-mode toggle from cancelling each other's newly-created notification.
export function setNotificationTime(hour, minute) {
  const operation = scheduleChain
    .catch(() => {})
    .then(() => applyNotificationTime(hour, minute));
  scheduleChain = operation.catch(() => {});
  return operation;
}

export async function getAlarmMode() {
  return (await AsyncStorage.getItem(KEY_ALARM)) === "yes";
}

export async function setAlarmPreference(enabled) {
  await AsyncStorage.setItem(KEY_ALARM, enabled ? "yes" : "no");
}

export async function setAlarmMode(enabled) {
  const previous = await getAlarmMode();
  await setAlarmPreference(enabled);
  try {
    const { hour, minute } = await getNotificationTime();
    return await setNotificationTime(hour, minute);
  } catch (error) {
    await setAlarmPreference(previous);
    throw error;
  }
}

export async function getNotificationTime() {
  const [[, savedHour], [, savedMinute]] = await AsyncStorage.multiGet([
    KEY_HOUR,
    KEY_MINUTE,
  ]);
  const hour = Number(savedHour);
  const minute = Number(savedMinute);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    minute:
      Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
}

export async function getReminderStatus() {
  const permission = await getNotificationPermission();
  const scheduleId = await AsyncStorage.getItem(KEY_SCHEDULE_ID);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return {
    ...permission,
    scheduled: Boolean(
      scheduleId && scheduled.some((item) => item.identifier === scheduleId)
    ),
  };
}

export async function scheduleTestNotification() {
  const alarm = await getAlarmMode();
  const permission = await getNotificationPermission({ request: true });
  if (!permission.granted) return { scheduled: false, ...permission };

  const scheduleId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "🍞 Prueba de Diario Pan",
      body: alarm
        ? "⏰ La campana del recordatorio funciona."
        : "El sonido del recordatorio funciona.",
      sound: alarm ? "campana.wav" : "default",
      interruptionLevel: alarm ? "timeSensitive" : "active",
      data: { kind: "reminder-test" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      repeats: false,
      channelId: alarm ? ALARM_CHANNEL_ID : NORMAL_CHANNEL_ID,
    },
  });

  return { scheduled: true, scheduleId, ...permission };
}

// Called on every launch. It recreates a missing local reminder (for example
// after an OS restore or a failure in an older build) and refreshes timezone,
// alarm preference and push token on the server without showing a prompt.
export async function refreshDeviceRegistration() {
  try {
    if (!(await hasCompletedWelcome())) return;

    const permission = await getNotificationPermission();
    if (!permission.granted) return;

    const { hour, minute } = await getNotificationTime();
    const alarm = await getAlarmMode();
    const scheduleVersion = await AsyncStorage.getItem(KEY_SCHEDULE_VERSION);
    const scheduleId = await AsyncStorage.getItem(KEY_SCHEDULE_ID);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduleExists = Boolean(
      scheduleId && scheduled.some((item) => item.identifier === scheduleId)
    );

    if (scheduleVersion !== SCHEDULE_VERSION || !scheduleExists) {
      await scheduleDailyReminder(hour, minute, alarm);
    }

    await registerCurrentDevice(hour, minute, alarm, false);
  } catch (error) {
    console.warn("Notification refresh failed:", error?.message);
  }
}

export async function hasCompletedWelcome() {
  return (await AsyncStorage.getItem(KEY_WELCOMED)) === "yes";
}

export async function markWelcomeCompleted() {
  await AsyncStorage.setItem(KEY_WELCOMED, "yes");
}
