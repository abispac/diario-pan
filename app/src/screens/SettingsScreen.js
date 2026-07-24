// ================================================================
// SettingsScreen.js - reached from the gear icon on Home.
//
// Exactly two settings, as designed - nothing to get lost in:
//   1. The daily notification time ("my alarm")
//   2. The app's color (the color picker)
// Changes apply instantly; there is no "save" button to forget.
// ================================================================

import React, { useContext, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { TextInput, Switch } from "react-native";
import { ThemeContext } from "../../App";
import { PALETTES } from "../theme";
import {
  getNotificationTime,
  setNotificationTime,
  getAlarmMode,
  setAlarmMode,
  getReminderStatus,
  scheduleTestNotification,
} from "../notifications";
import { getServerUrl, setServerUrl, DEFAULT_SERVER_URL } from "../api";

export default function SettingsScreen({ navigation }) {
  const theme = useContext(ThemeContext);
  const { width } = useWindowDimensions();
  const isTablet = width >= 700;

  const [time, setTime] = useState(null); // null until loaded
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);
  const [reminderStatus, setReminderStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const refreshStatus = async () => {
    try {
      setReminderStatus(await getReminderStatus());
    } catch (error) {
      console.warn("Reminder status unavailable:", error?.message);
    }
  };

  // Load the saved notification time + alarm mode when the screen opens.
  useEffect(() => {
    (async () => {
      const { hour, minute } = await getNotificationTime();
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      setTime(d);
      setAlarmOn(await getAlarmMode());
      await refreshStatus();
    })();
  }, []);

  // Flip alarm mode: reschedules the daily reminder with the bell
  // sound and maximum urgency (or back to a normal notification).
  const toggleAlarm = async (value) => {
    setAlarmOn(value);
    try {
      const result = await setAlarmMode(value);
      setReminderStatus(result);
      if (!result.scheduled) showPermissionAlert();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (error) {
      setAlarmOn(!value);
      Alert.alert("No se pudo guardar", error?.message || "Inténtalo otra vez.");
    }
  };

  const showPermissionAlert = () => {
    Alert.alert(
      "Recordatorios desactivados",
      "Activa las notificaciones de Diario Pan en Ajustes del teléfono.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
      ]
    );
  };

  const testReminder = async () => {
    setTesting(true);
    try {
      const result = await scheduleTestNotification();
      setReminderStatus((current) => ({ ...current, ...result }));
      if (!result.scheduled) {
        showPermissionAlert();
        return;
      }
      Alert.alert(
        "Prueba programada",
        "Sal de la app o bloquea la pantalla. El recordatorio sonará en 5 segundos."
      );
    } catch (error) {
      Alert.alert(
        "No se pudo probar",
        error?.message || "Revisa los permisos e inténtalo otra vez."
      );
    } finally {
      setTesting(false);
    }
  };

  // Apply a new time: reschedules the local notification AND
  // updates the server, all inside setNotificationTime().
  //
  // DEBOUNCED: the iOS spinner fires onChange for every wheel
  // detent. Without the debounce, scrolling from 8:00 to 21:30
  // would reschedule + hit the server dozens of times.
  const debounceRef = React.useRef(null);
  const applyTime = (newTime) => {
    setTime(newTime); // UI updates instantly
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await setNotificationTime(
          newTime.getHours(),
          newTime.getMinutes()
        );
        setReminderStatus(result);
        if (!result.scheduled) showPermissionAlert();
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      } catch (error) {
        Alert.alert("No se pudo guardar", error?.message || "Inténtalo otra vez.");
      }
    }, 800);
  };
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        isTablet && styles.contentTablet,
      ]}
    >
      {/* ---------- header ---------- */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={[styles.backText, { color: theme.accent }]}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.accentDark }]}>Ajustes</Text>
        {savedFlash && (
          <Text style={[styles.saved, { color: theme.accent }]}>Guardado ✓</Text>
        )}
      </View>

      {/* ---------- Setting 1: notification time ---------- */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          🔔 Hora de tu devocional
        </Text>
        <Text style={[styles.cardHint, { color: theme.textMuted }]}>
          Cada día te avisaremos a esta hora, con sonido, cuando el video esté listo.
        </Text>

        {time &&
          (Platform.OS === "android" ? (
            <TouchableOpacity
              style={[styles.timeButton, { borderColor: theme.accent }]}
              onPress={() => setShowAndroidPicker(true)}
            >
              <Text style={[styles.timeText, { color: theme.accent }]}>
                {time.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </TouchableOpacity>
          ) : (
            <DateTimePicker
              value={time}
              mode="time"
              display="spinner"
              onChange={(_, selected) => selected && applyTime(selected)}
            />
          ))}

        {showAndroidPicker && time && (
          <DateTimePicker
            value={time}
            mode="time"
            onChange={(_, selected) => {
              setShowAndroidPicker(false);
              if (selected) applyTime(selected);
            }}
          />
        )}

        {/* ---------- Alarm mode toggle ---------- */}
        <View style={styles.alarmRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 2 }]}>
              ⏰ Modo alarma
            </Text>
            <Text style={[styles.cardHint, { color: theme.textMuted, marginBottom: 0 }]}>
              Usa campana y prioridad máxima. El modo Silencio o No molestar
              del teléfono todavía puede limitar el sonido.
            </Text>
          </View>
          <Switch
            value={alarmOn}
            onValueChange={toggleAlarm}
            trackColor={{ true: theme.accent }}
          />
        </View>

        <View style={styles.reminderStatus}>
          <Text
            style={[
              styles.statusText,
              {
                color:
                  reminderStatus === null
                    ? theme.textMuted
                    : reminderStatus.granted && reminderStatus.scheduled
                    ? theme.accentDark
                    : "#a33a2b",
              },
            ]}
          >
            {reminderStatus === null
              ? "Comprobando recordatorio..."
              : reminderStatus.granted && reminderStatus.scheduled
              ? "✓ Recordatorio diario programado"
              : "⚠ El recordatorio necesita atención"}
          </Text>
          <TouchableOpacity
            style={[styles.testButton, { borderColor: theme.accent }]}
            onPress={testReminder}
            disabled={testing}
            accessibilityRole="button"
            accessibilityLabel="Probar recordatorio en cinco segundos"
          >
            <Text style={[styles.testButtonText, { color: theme.accent }]}>
              {testing ? "Programando..." : "Probar en 5 segundos"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ---------- Setting 2: the color picker ---------- */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>🎨 Color de la app</Text>
        <Text style={[styles.cardHint, { color: theme.textMuted }]}>
          Elige el color que más te guste.
        </Text>
        <View style={styles.swatches}>
          {Object.entries(PALETTES).map(([key, palette]) => (
            <TouchableOpacity
              key={key}
              onPress={() => theme.changePalette(key)}
              style={styles.swatchWrap}
              accessibilityLabel={`Color ${palette.name}`}
            >
              {/* The colored circle itself; a ring marks the active one */}
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: palette.accent },
                  theme.paletteKey === key && styles.swatchActive,
                ]}
              >
                {theme.paletteKey === key && (
                  <Text style={styles.swatchCheck}>✓</Text>
                )}
              </View>
              <Text style={[styles.swatchName, { color: theme.textMuted }]}>
                {palette.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ---------- Advanced: server address (DEV BUILDS ONLY) ----------
          Lets a development build talk to a test server (e.g. a
          MacBook on the local WiFi) with no rebuild. Hidden in the
          store version: end users could break their app with one
          typo, and reviewers flag user-configurable endpoints. */}
      {__DEV__ && (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>🔧 Avanzado</Text>
        <Text style={[styles.cardHint, { color: theme.textMuted }]}>
          Dirección del servidor. Déjalo vacío para usar el oficial
          ({DEFAULT_SERVER_URL}). Solo para pruebas.
        </Text>
        <TextInput
          style={[styles.urlInput, { borderColor: theme.accent, color: theme.text }]}
          defaultValue={getServerUrl() === DEFAULT_SERVER_URL ? "" : getServerUrl()}
          placeholder={DEFAULT_SERVER_URL}
          placeholderTextColor="#bbb"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          // Apply when the user finishes typing (keyboard "done"
          // or tapping elsewhere) - same instant-save pattern as
          // the rest of the screen.
          onEndEditing={async (e) => {
            await setServerUrl(e.nativeEvent.text);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
          }}
        />
      </View>
      )}

      {/* ---------- About ---------- */}
      <Text style={[styles.about, { color: theme.textMuted }]}>
        Diario Pan · código abierto, hecho con ❤️ por nuestra iglesia
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  contentTablet: { width: "100%", maxWidth: 760, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  back: { marginRight: 12 },
  backText: { fontSize: 17, fontWeight: "600" },
  title: { fontSize: 26, fontWeight: "800", flex: 1 },
  saved: { fontSize: 14, fontWeight: "700" },
  card: {
    borderRadius: 16, padding: 20, marginBottom: 16,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6 },
  cardHint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  timeButton: {
    borderWidth: 2, borderRadius: 12, alignSelf: "flex-start",
    paddingVertical: 10, paddingHorizontal: 28,
  },
  timeText: { fontSize: 26, fontWeight: "700" },
  swatches: { flexDirection: "row", justifyContent: "space-around" },
  swatchWrap: { alignItems: "center" },
  swatch: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
  },
  swatchActive: { borderWidth: 3, borderColor: "#fff", elevation: 4,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 } },
  swatchCheck: { color: "#fff", fontSize: 20, fontWeight: "800" },
  swatchName: { marginTop: 6, fontSize: 12, fontWeight: "600" },
  urlInput: {
    borderWidth: 2, borderRadius: 10, padding: 12, fontSize: 14,
  },
  alarmRow: {
    flexDirection: "row", alignItems: "center", marginTop: 18,
    borderTopWidth: 1, borderTopColor: "#f0e8dc", paddingTop: 16,
  },
  reminderStatus: {
    marginTop: 18, paddingTop: 16, borderTopWidth: 1,
    borderTopColor: "#f0e8dc",
  },
  statusText: { fontSize: 13, fontWeight: "700", marginBottom: 12 },
  testButton: {
    alignSelf: "flex-start", borderWidth: 2, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  testButtonText: { fontSize: 14, fontWeight: "700" },
  about: { textAlign: "center", fontSize: 12, marginTop: 12 },
});
