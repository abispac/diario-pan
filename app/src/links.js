// ================================================================
// links.js - the links that used to live on the Linktree.
//
// The website (server/public/index.html) shows this same set under
// "Más de Diario Pan". If a link ever changes, change it in BOTH
// places - here and there.
//
// Deliberately no App Store / Google Play links: whoever is reading
// this is already inside the app.
// ================================================================

export const READING_PLAN = {
  key: "plan",
  title: "Plan de Lectura",
  subtitle:
    "La guía de lectura bíblica del año, día por día. Ábrela aquí o imprímela para la mesa.",
  url: "https://drive.google.com/file/d/1SCdFikj3DlsTYyI7DgHeR-SPQw-Y7cJd/view?usp=sharing",
};

export const LINKS = [
  {
    key: "podcast",
    icon: require("../assets/icons/spotify.png"),
    title: "Podcast en Spotify",
    subtitle: "Ps. Marcos Richards",
    url: "https://open.spotify.com/show/3m5Fyjt2Np9RHfDix9VyNl",
  },
  {
    key: "youtube",
    icon: require("../assets/icons/youtube.png"),
    title: "YouTube",
    subtitle: "Todos los devocionales en video",
    url: "https://www.youtube.com/@diariopan9287",
  },
  {
    key: "facebook",
    icon: require("../assets/icons/facebook.png"),
    title: "Facebook",
    subtitle: "Comunidad Olivo",
    url: "https://www.facebook.com/comunidadolivo",
  },
  {
    key: "soundcloud",
    icon: require("../assets/icons/soundcloud.png"),
    title: "SoundCloud",
    subtitle: "Prédicas y audio de la iglesia",
    url: "https://soundcloud.com/comunidad_olivo",
  },
];
