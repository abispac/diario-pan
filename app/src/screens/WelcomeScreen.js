// ================================================================
// WelcomeScreen.js - what a brand-new user sees, exactly once.
//
// One question, that's the whole setup:
//   "¿A qué hora quieres tu devocional?"
// The user picks a time, we ask for notification permission,
// schedule everything, and land on the Home screen where today's
// video is already waiting.
// ================================================================

import React, { useContext, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Switch,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemeContext } from "../../App";
import {
  setNotificationTime,
  setAlarmPreference,
  markWelcomeCompleted,
} from "../notifications";

export default function WelcomeScreen({ navigation }) {
  const theme = useContext(ThemeContext);

  // The proposed default: 8:00am. Most people watch a devotional
  // first thing in the morning.
  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  // Android shows the time picker as a dialog on demand; iOS shows
  // it inline permanently. This flag drives the Android dialog.
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Alarm mode: off by default; the user can flip it here or later
  // in Ajustes.
  const [alarmOn, setAlarmOn] = useState(false);

  // Called when the user confirms their time. Does ALL the setup:
  // alarm preference, permission, local daily notification, server
  // registration.
  const confirmTime = async () => {
    setSaving(true);
    try {
      // Mark the welcome as done FIRST. Even if scheduling below
      // fails for any reason (permission denied, flaky network),
      // the user must never be asked to set up again - they can
      // always adjust the time later in Ajustes.
      await markWelcomeCompleted();
      await setAlarmPreference(alarmOn); // must be saved BEFORE scheduling
      await setNotificationTime(time.getHours(), time.getMinutes());
    } catch (err) {
      // Log and move on - Home works fine without notifications.
      console.warn("Welcome setup issue:", err?.message);
    } finally {
      setSaving(false);
      // Reset navigation so "back" can't return to the welcome.
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ---------------- the one and only step: pick the time ---------------- */}
      <View style={styles.timeWrap}>
          {/* Placeholder logo - swap for the church logo image */}
          <View style={[styles.logo, { backgroundColor: theme.accent }]}>
            <Text style={styles.logoEmoji}>🍞</Text>
          </View>

          <Text style={[styles.title, { color: theme.accentDark }]}>
            ¿A qué hora quieres tu devocional?
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Cada día te avisaremos a esta hora cuando el video esté listo.
            Puedes cambiarla cuando quieras en Ajustes.
          </Text>

          {Platform.OS === "android" ? (
            // Android: a big button that opens the system time dialog.
            <TouchableOpacity
              style={[styles.timeButton, { borderColor: theme.accent }]}
              onPress={() => setShowAndroidPicker(true)}
            >
              <Text style={[styles.timeText, { color: theme.accent }]}>
                {time.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </TouchableOpacity>
          ) : (
            // iOS: the native spinner sits right on the screen.
            <DateTimePicker
              value={time}
              mode="time"
              display="spinner"
              onChange={(_, selected) => selected && setTime(selected)}
            />
          )}

          {showAndroidPicker && (
            <DateTimePicker
              value={time}
              mode="time"
              onChange={(_, selected) => {
                setShowAndroidPicker(false);
                if (selected) setTime(selected);
              }}
            />
          )}

          {/* Alarm mode: notification vs. wake-up-bell experience */}
          <View style={styles.alarmRow}>
            <Text style={[styles.alarmLabel, { color: theme.textMuted }]}>
              ⏰ Modo alarma (campana fuerte)
            </Text>
            <Switch
              value={alarmOn}
              onValueChange={setAlarmOn}
              trackColor={{ true: theme.accent }}
            />
          </View>

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.accent }]}
            onPress={confirmTime}
            disabled={saving}
          >
            <Text style={styles.ctaText}>
              {saving ? "Guardando..." : "¡Listo, empezar!"}
            </Text>
          </TouchableOpacity>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  timeWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  logo: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  logoEmoji: { fontSize: 44 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  subtitle: { fontSize: 15, textAlign: "center", marginBottom: 28, lineHeight: 22 },
  timeButton: {
    borderWidth: 2, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 40, marginBottom: 12,
  },
  timeText: { fontSize: 32, fontWeight: "700" },
  alarmRow: {
    flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10,
  },
  alarmLabel: { fontSize: 14, fontWeight: "600" },
  cta: {
    marginTop: 28, paddingVertical: 16, paddingHorizontal: 48,
    borderRadius: 14,
  },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
