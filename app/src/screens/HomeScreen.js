// ================================================================
// HomeScreen.js - the main screen, laid out like diariopan.com so
// the app and the website feel like one thing.
//
//   * a greeting that matches the reader's clock
//   * today's devotional, playable right here
//   * the older devotionals, scrolling sideways
//   * "Más de Diario Pan": the reading plan, the podcast and the
//     church's socials - the links that used to live on the
//     Linktree. No app-download links: you are already in the app.
//
// Gear icon (top right) opens Settings. Pull down to refresh.
// ================================================================

import React, { useCallback, useContext, useState } from "react";
import {
  View,
  Text,
  Image,
  Linking,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { useFocusEffect } from "@react-navigation/native";
import { ThemeContext } from "../../App";
import { fetchVideos, streamUrl } from "../api";
import { DISPLAY_FONT } from "../theme";
import { LINKS, READING_PLAN } from "../links";

// Turn "2026-07-04" into "Viernes, 4 de julio" - warm and human,
// the way you'd say it out loud.
function prettyDate(isoDate) {
  if (!isoDate) return ""; // never crash over a missing date
  const [y, m, d] = isoDate.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// The three score marks off the loaf, reused as a section rule -
// the same divider the website uses.
function SectionHeading({ theme, children }) {
  return (
    <View style={styles.heading}>
      <Text style={[styles.marks, { color: theme.accent }]}>///</Text>
      <Text style={[styles.headingText, { color: theme.text }]}>{children}</Text>
      <View style={[styles.headingLine, { backgroundColor: theme.rule }]} />
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const theme = useContext(ThemeContext);
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 700;
  const [videos, setVideos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  // The devotionals are filmed vertically, so start portrait and
  // correct to the real shape once the video reports its size.
  const [heroAspect, setHeroAspect] = useState(9 / 16);

  // Handle to today's inline video player, so we can pause it
  // when the user leaves this screen.
  const heroRef = React.useRef(null);
  const loadSequence = React.useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadSequence.current;
    // fetchVideos() returns null on network/server trouble, so we
    // can tell "no connection" apart from "nothing published yet".
    const result = await fetchVideos();
    // A focus refresh and a pull-to-refresh can overlap. Ignore an
    // older response if a newer request already started.
    if (requestId !== loadSequence.current) return;
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
        loadSequence.current += 1;
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Open an outside link. If the phone has nothing that can open
  // it, fail quietly rather than crashing the screen.
  const open = (url) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ---------- Header: the loaf, the wordmark, settings ---------- */}
      <View style={[styles.header, isTablet && styles.constrained]}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.logo}
          accessibilityLabel="Diario Pan"
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.wordmark, { color: theme.text }]}>
            DIARIO PAN
          </Text>
          <Text style={[styles.tagline, { color: theme.textMuted }]}>
            Comunidad Olivo
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("Settings")}
          style={styles.gear}
          accessibilityLabel="Ajustes"
        >
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && styles.constrained,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ---------- Today ---------- */}
        {videos.length > 0 && (
          <View style={styles.greetingWrap}>
            <Text style={[styles.greeting, { color: theme.accentDark }]}>
              {greeting()}
            </Text>
            <Text style={[styles.greetingSub, { color: theme.textMuted }]}>
              Diario Pan es un devocional diario que te ayuda a crecer con la Palabra de Dios.
            </Text>
          </View>
        )}

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
            <View
              style={[
                styles.heroCard,
                { backgroundColor: theme.card, borderColor: theme.rule },
              ]}
            >
              <Video
                ref={heroRef}
                // key forces a fresh player when the day's video
                // changes (e.g. after a pull-to-refresh at midnight)
                key={videos[0].id}
                source={{ uri: streamUrl(videos[0].id) }}
                style={[
                  styles.heroVideo,
                  { aspectRatio: heroAspect, maxHeight: height * 0.6 },
                ]}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls // play/pause/seek right here
                onReadyForDisplay={(event) => {
                  const size = event?.naturalSize;
                  if (size?.width && size?.height) {
                    setHeroAspect(size.width / size.height);
                  }
                }}
                // NOT shouldPlay: it waits politely until the
                // user presses play.
              />
              <View style={styles.heroMeta}>
                <View style={[styles.todayTag, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.todayText, { color: theme.onAccent }]}>
                    HOY
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={[styles.heroTitle, { color: theme.text }]}
                    numberOfLines={3}
                  >
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
                <SectionHeading theme={theme}>
                  Devocionales anteriores
                </SectionHeading>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={videos.slice(1)}
                  keyExtractor={(item) => String(item.id)}
                  contentContainerStyle={{ paddingRight: 4, paddingVertical: 4 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.pastCard,
                        isTablet && styles.pastCardTablet,
                        { backgroundColor: theme.card, borderColor: theme.rule },
                      ]}
                      onPress={() =>
                        navigation.navigate("Player", {
                          videoId: item.id,
                          title: item.title,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      {/* Play badge - these open the full player */}
                      <View
                        style={[
                          styles.playBadge,
                          { backgroundColor: theme.background, borderColor: theme.rule },
                        ]}
                      >
                        <Text style={{ color: theme.accent, fontSize: 15 }}>▶</Text>
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

        {/* ---------- The links ----------
            The same set the website shows, so nobody has to hunt for
            the reading plan or the podcast. No heading: the cards
            announce themselves. */}
        <View style={[styles.divider, { backgroundColor: theme.rule }]} />

        <TouchableOpacity
          style={[styles.feature, { backgroundColor: theme.accent }]}
          onPress={() => open(READING_PLAN.url)}
          activeOpacity={0.85}
        >
          <Text style={[styles.featureKicker, { color: theme.onAccent }]}>
            DESCARGA E IMPRIME
          </Text>
          <Text style={[styles.featureTitle, { color: theme.onAccent }]}>
            {READING_PLAN.title}
          </Text>
          <Text style={[styles.featureBody, { color: theme.onAccent }]}>
            {READING_PLAN.subtitle}
          </Text>
        </TouchableOpacity>

        {LINKS.map((link) => (
          <TouchableOpacity
            key={link.key}
            style={[
              styles.link,
              { backgroundColor: theme.card, borderColor: theme.rule },
            ]}
            onPress={() => open(link.url)}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={link.title}
          >
            <Image
              source={link.icon}
              style={styles.linkIcon}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkTitle, { color: theme.text }]}>
                {link.title}
              </Text>
              <Text style={[styles.linkSub, { color: theme.textMuted }]}>
                {link.subtitle}
              </Text>
            </View>
            <Text style={[styles.linkGo, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={[styles.footer, { color: theme.textMuted }]}>
          Diario Pan · Comunidad Olivo
        </Text>
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
  constrained: { width: "100%", maxWidth: 1000, alignSelf: "center" },
  scrollContent: { padding: 16, paddingBottom: 48 },

  logo: { width: 42, height: 42, borderRadius: 21, marginRight: 12 },
  wordmark: { fontSize: 15, fontWeight: "700", letterSpacing: 3.4 },
  tagline: { fontSize: 12.5, marginTop: 2 },
  gear: { padding: 6 },

  greetingWrap: { alignItems: "center", marginTop: 6, marginBottom: 18 },
  greeting: { fontFamily: DISPLAY_FONT, fontSize: 30, fontWeight: "600" },
  greetingSub: {
    fontFamily: DISPLAY_FONT, fontStyle: "italic",
    fontSize: 14.5, marginTop: 6, textAlign: "center",
  },

  empty: { textAlign: "center", marginTop: 80, fontSize: 15, lineHeight: 24 },

  heroCard: {
    borderRadius: 18, overflow: "hidden", marginBottom: 8, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  heroVideo: { width: "100%", backgroundColor: "#000" },
  heroMeta: { flexDirection: "row", alignItems: "center", padding: 16 },
  heroTitle: { fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: "600", lineHeight: 23 },
  todayTag: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  todayText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  heading: {
    flexDirection: "row", alignItems: "center",
    marginTop: 30, marginBottom: 14,
  },
  marks: { fontSize: 17, fontWeight: "800", opacity: 0.55, marginRight: 10 },
  headingText: { fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: "600" },
  headingLine: { flex: 1, height: 1, marginLeft: 12 },

  pastCard: {
    width: 190, borderRadius: 14, padding: 14, marginRight: 12, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  pastCardTablet: { width: 250, minHeight: 150 },
  playBadge: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 15.5, fontWeight: "600", lineHeight: 20 },
  cardDate: { fontSize: 13, marginTop: 3 },

  feature: {
    borderRadius: 16, padding: 22, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  featureKicker: { fontSize: 11, fontWeight: "700", letterSpacing: 1.6, opacity: 0.75 },
  featureTitle: { fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: "600", marginTop: 4 },
  featureBody: { fontSize: 14.5, lineHeight: 21, marginTop: 7, opacity: 0.85 },

  link: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 13, borderWidth: 1, padding: 15, marginBottom: 10,
  },
  linkIcon: { width: 26, height: 26, marginRight: 15 },
  divider: { height: 1, marginTop: 34, marginBottom: 22 },
  linkTitle: { fontSize: 16, fontWeight: "600" },
  linkSub: { fontSize: 13.5, marginTop: 1 },
  linkGo: { fontSize: 22, marginLeft: 8 },

  footer: { textAlign: "center", fontSize: 13, marginTop: 30 },
});
