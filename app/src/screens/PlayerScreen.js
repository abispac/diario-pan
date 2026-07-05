// ================================================================
// PlayerScreen.js - plays one devotional. This screen is the
// entire reason the project exists: just the video, in peace.
//
// Designed as a warm, quiet place rather than a black void: the
// same soft background as the rest of the app, the video resting
// in a rounded card, a verse underneath - like opening a book,
// not launching a cinema.
//
// The stream URL points at OUR server, which silently serves the
// bytes from its local copy or falls back to Google Drive. The
// phone never talks to Facebook, never sees an ad.
// ================================================================

import React, { useContext } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { ThemeContext } from "../../App";
import { streamUrl } from "../api";

export default function PlayerScreen({ route, navigation }) {
  const theme = useContext(ThemeContext);
  const { videoId, title } = route.params || {};
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      {/* Back link, in the app's accent color */}
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={[styles.backText, { color: theme.accent }]}>‹ Volver</Text>
      </TouchableOpacity>

      {/* Small bread emblem above the video - a gentle touch of
          identity while the first bytes arrive. */}
      <View style={[styles.emblem, { backgroundColor: theme.accent }]}>
        <Text style={{ fontSize: 24 }}>🍞</Text>
      </View>

      {error ? (
        // Both server sources failed, or no internet. Say so kindly,
        // in the same warm setting.
        <View style={[styles.card, styles.errorWrap, { backgroundColor: theme.card }]}>
          <Text style={styles.errorEmoji}>📡</Text>
          <Text style={[styles.errorText, { color: theme.textMuted }]}>
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
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          {/* The video itself keeps a dark letterbox (video always
              does), but it sits inside a warm rounded card. */}
          <View style={styles.videoFrame}>
            {loading && (
              <ActivityIndicator
                size="large"
                color={theme.accent}
                style={styles.spinner}
              />
            )}
            <Video
              source={{ uri: streamUrl(videoId) }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay          // start immediately - that's why they tapped
              useNativeControls   // familiar play/pause/seek controls
              onReadyForDisplay={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
            />
          </View>

          {/* The devotional's title */}
          {title ? (
            <Text style={[styles.title, { color: theme.accentDark }]}>{title}</Text>
          ) : null}
        </View>
      )}

      {/* A verse to close the moment - part of the atmosphere. */}
      <Text style={[styles.verse, { color: theme.textMuted }]}>
        «Lámpara es a mis pies tu palabra,{"\n"}y lumbrera a mi camino.»
      </Text>
      <Text style={[styles.verseRef, { color: theme.textMuted }]}>Salmos 119:105</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20, paddingTop: 56, paddingBottom: 48,
    alignItems: "center",
  },
  back: { alignSelf: "flex-start", padding: 4, marginBottom: 8 },
  backText: { fontSize: 17, fontWeight: "600" },
  emblem: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  card: {
    width: "100%", borderRadius: 20, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  videoFrame: { backgroundColor: "#1d1712" /* warm near-black, not pure black */ },
  video: { width: "100%", aspectRatio: 16 / 9 },
  spinner: {
    position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 5,
  },
  title: {
    fontSize: 17, fontWeight: "700", textAlign: "center",
    paddingVertical: 16, paddingHorizontal: 20,
  },
  verse: {
    marginTop: 28, fontSize: 15, fontStyle: "italic",
    textAlign: "center", lineHeight: 24,
  },
  verseRef: { marginTop: 6, fontSize: 12, fontWeight: "600" },
  errorWrap: { alignItems: "center", padding: 32 },
  errorEmoji: { fontSize: 44, marginBottom: 12 },
  errorText: { textAlign: "center", fontSize: 15, lineHeight: 22 },
  retry: { marginTop: 20, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
