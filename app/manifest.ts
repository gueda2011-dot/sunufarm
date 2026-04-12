import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "SunuFarm",
    short_name: "SunuFarm",
    description: "Pilotage avicole pour les fermes et organisations en Afrique francophone.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f9fafb",
    theme_color: "#16a34a",
    lang: "fr",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/branding/icon-android-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/branding/icon-android-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/branding/icon-android-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/branding/icon-android-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  }
}
