// ================================================================
// HomeScreen.js - the main screen: every published devotional,
// newest first. Tap one to watch it. Gear icon (top right) opens
// Settings. Pull down to refresh the list.
// ================================================================

import React, { useCallback, useContext, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ThemeContext } from "../../App";
import { fetchVideos } from "../api";

// Turn "2026-07-04" into "viernes, 4 de julio" - warm and human,
// the way you'd say it out loud.
function prettyDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function HomeScreen({ navigation }) {
  const theme = useContext(ThemeContext);
  const [videos, setVideos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setVideos(await fetchVideos());
    setLoaded(true);
  }, []);

  // Reload every time the screen comes into focus - so returning
  // from the player after midnight, or opening from a
  // notification, always shows the freshest list.
  useFocusEffect(
    useCallback(() => {
      load();
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

      {/* ---------- The list of devotionals ---------- */}
      <FlatList
        data={videos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        // Friendly empty state instead of a blank void.
        ListEmptyComponent={
          loaded ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              Aún no hay devocionales.{"\n"}Desliza hacia abajo para actualizar.
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card }]}
            onPress={() => navigation.navigate("Player", { videoId: item.id, title: item.title })}
            activeOpacity={0.7}
          >
            {/* Play badge */}
            <View style={[styles.playBadge, { backgroundColor: theme.accent }]}>
              <Text style={{ color: "#fff", fontSize: 18 }}>▶</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.cardDate, { color: theme.textMuted }]}>
                {prettyDate(item.publish_date)}
              </Text>
            </View>
            {/* "HOY" tag on the newest video so today's devotional
                jumps out visually. */}
            {index === 0 && (
              <View style={[styles.todayTag, { backgroundColor: theme.accent }]}>
                <Text style={styles.todayText}>HOY</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
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
  card: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  playBadge: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardDate: { fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  todayTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  todayText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
