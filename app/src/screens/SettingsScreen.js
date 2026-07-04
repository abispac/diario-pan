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
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { TextInput } from "react-native";
import { ThemeContext } from "../../App";
import { PALETTES } from "../theme";
import { getNotificationTime, setNotificationTime } from "../notifications";
import { getServerUrl, setServerUrl, DEFAULT_SERVER_URL } from "../api";

export default function SettingsScreen({ navigation }) {
  const theme = useContext(ThemeContext);

  const [time, setTime] = useState(null); // null until loaded
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Load the currently saved notification time when the screen opens.
  useEffect(() => {
    (async () => {
      const { hour, minute } = await getNotificationTime();
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      setTime(d);
    })();
  }, []);

  // Apply a new time: reschedules the local notification AND
  // updates the server, all inside setNotificationTime().
  const applyTime = async (newTime) => {
    setTime(newTime);
    await setNotificationTime(newTime.getHours(), newTime.getMinutes());
    // Tiny "Guardado ✓" confirmation that fades the anxiety of
    // "did it save?" without needing a button.
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
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

      {/* ---------- Advanced: server address ----------
          Lets the SAME build talk to a test server today (e.g. a
          MacBook on the local WiFi) and the real server tomorrow,
          with no rebuild. Normal users never need to touch this -
          leaving it empty uses the official server. */}
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

      {/* ---------- About ---------- */}
      <Text style={[styles.about, { color: theme.textMuted }]}>
        Diario Pan · código abierto, hecho con ❤️ por nuestra iglesia
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
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
  about: { textAlign: "center", fontSize: 12, marginTop: 12 },
});
