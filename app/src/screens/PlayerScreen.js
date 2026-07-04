// ================================================================
// PlayerScreen.js - plays one devotional, full width, no ads,
// no distractions. This screen is the entire reason the project
// exists: just the video, in peace.
//
// The stream URL points at OUR server, which silently serves the
// bytes from its local copy or falls back to Google Drive. The
// phone never talks to Facebook, never sees an ad.
// ================================================================

import React, { useContext } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { ThemeContext } from "../../App";
import { streamUrl } from "../api";

export default function PlayerScreen({ route, navigation }) {
  const theme = useContext(ThemeContext);
  const { videoId, title } = route.params || {};
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* Back button floating over the video */}
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver</Text>
      </TouchableOpacity>

      {/* Spinner while the first bytes arrive */}
      {loading && !error && (
        <ActivityIndicator size="large" color={theme.accent} style={styles.spinner} />
      )}

      {error ? (
        // Both server sources failed, or no internet. Say so kindly.
        <View style={styles.errorWrap}>
          <Text style={styles.errorEmoji}>📡</Text>
          <Text style={styles.errorText}>
            No se pudo cargar el video.{"\n"}Revisa tu conexión e intenta de nuevo.
          </Text>
          <TouchableOpacity
            style={[styles.retry, { backgroundColor: theme.accent }]}
            onPress={() => { setError(false); setLoading(true); }}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Video
          source={{ uri: streamUrl(videoId) }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay          // start immediately - that's why they tapped
          useNativeControls   // the familiar play/pause/seek controls
          onReadyForDisplay={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}

      {/* The devotional's title under the video */}
      {title && !error ? <Text style={styles.title}>{title}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  back: { position: "absolute", top: 56, left: 20, zIndex: 10, padding: 8 },
  backText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  spinner: { position: "absolute", alignSelf: "center", zIndex: 5 },
  video: { width: "100%", aspectRatio: 16 / 9 },
  title: {
    color: "#fff", fontSize: 16, fontWeight: "600",
    textAlign: "center", marginTop: 16, paddingHorizontal: 24,
  },
  errorWrap: { alignItems: "center", padding: 32 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { color: "#ccc", textAlign: "center", fontSize: 15, lineHeight: 22 },
  retry: { marginTop: 20, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
