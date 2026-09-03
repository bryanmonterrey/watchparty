import type { MetadataRoute } from "next";

// Web app manifest — drives Android "install app" / PWA home-screen behaviour.
// Next emits <link rel="manifest"> automatically from this file.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Watchparty",
    short_name: "Watchparty",
    description:
      "Magic internet money meets streaming",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      // Rendered by scripts/dev/render-app-icons.mjs: star inset on the dark
      // canvas, inside the maskable safe zone — so one file serves both
      // purposes and Android's mask never clips the mark.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
