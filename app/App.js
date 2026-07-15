// ================================================================
// App.js - the root of the mobile app.
//
// Decides which screen the user sees:
//   * First launch ever  -> Welcome (presentation video + pick time)
//   * Every launch after -> Home (list of devotionals)
// and wires up navigation between Home, Player and Settings.
//
// It also creates the ThemeContext: the user's chosen color
// palette (from Settings) is stored on the phone and made
// available to every screen through React context.
// ================================================================

import React, { createContext, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import WelcomeScreen from "./src/screens/WelcomeScreen";
import HomeScreen from "./src/screens/HomeScreen";
import PlayerScreen from "./src/screens/PlayerScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import {
  hasCompletedWelcome,
  refreshDeviceRegistration,
} from "./src/notifications";
import { loadServerUrl } from "./src/api";
import { PALETTES, DEFAULT_PALETTE, COMMON } from "./src/theme";

const Stack = createNativeStackNavigator();

// Every screen reads colors (and can change the palette) from here.
export const ThemeContext = createContext(null);

const KEY_PALETTE = "dp_palette";

export default function App() {
  // null = still checking storage; true/false = decided.
  const [welcomed, setWelcomed] = useState(null);
  const [paletteKey, setPaletteKey] = useState(DEFAULT_PALETTE);

  // On startup: load the saved server URL override (if any),
  // check whether the welcome flow was already completed, and
  // restore the color palette the user picked last time.
  useEffect(() => {
    (async () => {
      await loadServerUrl(); // must happen before any screen fetches
      setWelcomed(await hasCompletedWelcome());
      const saved = await AsyncStorage.getItem(KEY_PALETTE);
      if (saved && PALETTES[saved]) setPaletteKey(saved);
      // Quietly re-register with the server so the push always uses
      // the phone's CURRENT timezone (matters if the user traveled).
      refreshDeviceRegistration();
    })();
  }, []);

  // Change palette + remember the choice for next launch.
  const changePalette = async (key) => {
    if (!PALETTES[key]) return;
    setPaletteKey(key);
    await AsyncStorage.setItem(KEY_PALETTE, key);
  };

  // If the user TAPS a push notification, take them straight to
  // the video it announces - no hunting through menus. Two cases:
  //   a) App running (foreground/background): the listener fires.
  //   b) App CLOSED and launched BY the tap: the tap happened
  //      before any listener existed, so we ask the OS for the
  //      "last notification response" once navigation is ready.
  const navigationRef = React.useRef(null);
  const navReady = React.useRef(false);
  const pendingVideoId = React.useRef(null);

  const openVideo = (videoId) => {
    if (!videoId) return;
    if (navReady.current && navigationRef.current) {
      navigationRef.current.navigate("Player", { videoId });
    } else {
      pendingVideoId.current = videoId; // navigate in onReady below
    }
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openVideo(response.notification.request.content.data?.videoId);
    });
    // Cold start: was the app launched by tapping a notification?
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openVideo(response.notification.request.content.data?.videoId);
    });
    return () => sub.remove();
  }, []);

  // Brief blank moment while AsyncStorage answers (a few ms).
  if (welcomed === null) return null;

  // The theme object handed to all screens: current palette's
  // colors + the shared ones + the setter.
  const theme = {
    ...PALETTES[paletteKey],
    ...COMMON,
    paletteKey,
    changePalette,
  };

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          navReady.current = true;
          if (pendingVideoId.current) {
            navigationRef.current?.navigate("Player", {
              videoId: pendingVideoId.current,
            });
            pendingVideoId.current = null;
          }
        }}
      >
        <StatusBar style="dark" />
        <Stack.Navigator
          // Skip Welcome for anyone who already finished it.
          initialRouteName={welcomed ? "Home" : "Welcome"}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Player" component={PlayerScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeContext.Provider>
  );
}
