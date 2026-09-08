// ================================================================
// theme.js - all branding in one file.
//
// The palettes below mirror the website (diariopan.com) so the app
// and the site read as one thing. The color picker in Settings lets
// each user choose their own accent; every palette carries a full
// set of colors so text stays readable whichever one they pick.
// ================================================================

import { Platform } from "react-native";

// The website sets headings in a serif and everything else in a
// sans. Rather than shipping a font file (which would force a new
// store build), we use the serif each platform already has - the
// same fallback the website itself declares.
export const DISPLAY_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

// The palette offered by the color picker in Settings. Each entry
// is a full accent theme so every color stays readable.
//   accent      - the brand color: buttons, badges, the loaf
//   accentDark  - headings and pressed states
//   background  - the page behind everything ("paper")
//   rule        - hairlines and card borders, tinted to the accent
export const PALETTES = {
  pan: {
    name: "Pan",           // warm bread-brown - the default
    accent: "#7c4a1e",
    accentDark: "#4e2d10",
    background: "#f3ece1",
    rule: "#e2d5c3",
  },
  cielo: {
    name: "Cielo",         // sky blue
    accent: "#2563a8",
    accentDark: "#153e6b",
    background: "#e8f0f9",
    rule: "#cbdcef",
  },
  vid: {
    name: "Vid",           // vine green
    accent: "#3d7a3d",
    accentDark: "#245224",
    background: "#eaf4ea",
    rule: "#cde3cd",
  },
  uva: {
    name: "Uva",           // grape purple
    accent: "#6b4a8f",
    accentDark: "#452e60",
    background: "#f0eaf7",
    rule: "#ddd0ec",
  },
};

// Colors that stay the same in every palette.
export const COMMON = {
  card: "#fffdf9",
  text: "#241a12",
  textMuted: "#857263",
  onAccent: "#fdf7ef",   // text sitting on top of the accent color
};

export const DEFAULT_PALETTE = "pan";
