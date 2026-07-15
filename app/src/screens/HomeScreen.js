// ================================================================
// HomeScreen.js - the main screen. Today's devotional sits at the
// top as a real, playable video (press play right there - no
// screen change). The older devotionals are listed below it;
// tapping one of those opens the full-screen player. Gear icon
// (top right) opens Settings. Pull down to refresh.
// ================================================================

import React, { useCallback, useContext, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useFocusEffect } from "@react-navigation/native";
import { ThemeContext } from "../../App";
import { fetchVideos, streamUrl } from "../api";

// Turn "2026-07-04" into "viernes, 4 de julio" - warm and human,
// the way you'd say it out loud.
function prettyDate(isoDate) {
  if (!isoDate) return ""; // never crash over a missing date
  const [y, m, d] = isoDate.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // Capitalize only the first letter: "Martes, 14 de julio".
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function HomeScreen({ navigation }) {
  const theme = useContext(ThemeContext);
  const [videos, setVideos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);

  // Handle to today's inline video player, so we can pause it
  // when the user leaves this screen.
  const heroRef = React.useRef(null);

  const load = useCallback(async () => {
    // fetchVideos() returns null on network/server trouble, so we
    // can tell "no connection" apart from "nothing published yet".
    const result = await fetchVideos();
    if (result === null) {
      setOffline(true); // keep whatever list we already had
    } else {
      setOffline(false);
      setVideos(result);
    }
    setLoaded(true);
  }, []);

  // Reload every time the screen comes into focus - so returning
  // from the player after midnight, or opening from a
  // notification, always shows the freshest list. The cleanup
  // (run when the screen LOSES focus) pauses today's video, so it
  // never keeps talking underneath another one.
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        heroRef.current?.pauseAsync?.().catch(() => {});
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ---------- Header: logo, title, settings gear ---------- */}
      <View style={styles.header}>
        <View style={[styles.logoSmall, { backgroundColor: theme.accent }]}>
          <Text style={{ fontSize: 20 }}>🍞</Text>
        </View>
        <Text style={[styles.headerTitle, { color: theme.accentDark }]}>
          Diario Pan
        </Text>
        {/* The settings icon requested in the design - opens the
            screen where time and colors can be changed. */}
        <TouchableOpacity
          onPress={() => navigation.navigate("Settings")}
          style={styles.gear}
          accessibilityLabel="Ajustes"
        >
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* ---------- Today's video + the older ones ----------
          The newest video (videos[0]) is rendered as a playable
          card, so it plays RIGHT HERE on the main screen. The
          older devotionals scroll SIDEWAYS below it, like flipping
          through the pages of a diary. */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Friendly empty state instead of a blank void. */}
        {loaded && videos.length === 0 && (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            {offline
              ? "No se pudo conectar.\nRevisa tu conexión a internet y desliza hacia abajo para reintentar."
              : "Aún no hay devocionales.\nDesliza hacia abajo para actualizar."}
          </Text>
        )}

        {videos.length > 0 && (
          <View>
            {/* ----- Today's devotional, playable in place ----- */}
            <View style={[styles.heroCard, { backgroundColor: theme.card }]}>
              <Video
                ref={heroRef}
                // key forces a fresh player when the day's video
                // changes (e.g. after a pull-to-refresh at midnight)
                key={videos[0].id}
                source={{ uri: streamUrl(videos[0].id) }}
                style={styles.heroVideo}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls // play/pause/seek right here
                // NOT shouldPlay: it waits politely until the
                // user presses play.
              />
              <View style={styles.heroMeta}>
                <View style={[styles.todayTag, { backgroundColor: theme.accent }]}>
                  <Text style={styles.todayText}>HOY</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                    {videos[0].title}
                  </Text>
                  <Text style={[styles.cardDate, { color: theme.textMuted }]}>
                    {prettyDate(videos[0].publish_date)}
                  </Text>
                </View>
              </View>
            </View>

            {/* ----- Older devotionals: horizontal row ----- */}
            {videos.length > 1 && (
              <View>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                  Devocionales anteriores
                </Text>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={videos.slice(1)}
                  keyExtractor={(item) => String(item.id)}
                  contentContainerStyle={{ paddingRight: 4, paddingVertical: 4 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.pastCard, { backgroundColor: theme.card }]}
                      onPress={() =>
                        navigation.navigate("Player", {
                          videoId: item.id,
                          title: item.title,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      {/* Play badge - these open the full player */}
                      <View style={[styles.playBadge, { backgroundColor: theme.accent }]}>
                        <Text style={{ color: "#fff", fontSize: 18 }}>▶</Text>
                      </View>
                      <Text
                        style={[styles.cardTitle, { color: theme.text, marginTop: 10 }]}
                        numberOfLines={3}
                      >
                        {item.title}
                      </Text>
                      <Text style={[styles.cardDate, { color: theme.textMuted }]}>
                        {prettyDate(item.publish_date)}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
  },
  logoSmall: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", flex: 1 },
  gear: { padding: 6 },
  empty: { textAlign: "center", marginTop: 80, fontSize: 15, lineHeight: 24 },
  heroCard: {
    borderRadius: 16, overflow: "hidden", marginBottom: 8,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  heroVideo: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  heroMeta: { flexDirection: "row", alignItems: "center", padding: 14 },
  sectionLabel: {
    fontSize: 13, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.5, marginTop: 16, marginBottom: 10, marginLeft: 4,
  },
  pastCard: {
    width: 190, borderRadius: 14, padding: 14, marginRight: 12,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  playBadge: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardDate: { fontSize: 13, marginTop: 2 },
  todayTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  todayText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
