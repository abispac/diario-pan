// ================================================================
// theme.js - all branding in one file.
//
// When the church logo and official colors arrive, this is the
// ONLY file that needs editing (plus dropping the image files
// into assets/). The color picker in Settings lets each user
// choose their own accent from the palette below.
// ================================================================

// The palette offered by the color picker in Settings. Each entry
// is a full accent theme so every color stays readable.
export const PALETTES = {
  pan: {
    name: "Pan",           // warm bread-brown - the default
    accent: "#7c4a1e",
    accentDark: "#4e2d10",
    background: "#f5ede3",
  },
  cielo: {
    name: "Cielo",         // sky blue
    accent: "#2563a8",
    accentDark: "#153e6b",
    background: "#e8f0f9",
  },
  vid: {
    name: "Vid",           // vine green
    accent: "#3d7a3d",
    accentDark: "#245224",
    background: "#eaf4ea",
  },
  uva: {
    name: "Uva",           // grape purple
    accent: "#6b4a8f",
    accentDark: "#452e60",
    background: "#f0eaf7",
  },
};

// Colors that stay the same in every palette.
export const COMMON = {
  card: "#ffffff",
  text: "#2b2018",
  textMuted: "#8a7a68",
};

export const DEFAULT_PALETTE = "pan";
