import type { MetadataRoute } from "next";

// Web app manifest — drives Android "install app" / PWA home-screen behaviour.
// Next emits <link rel="manifest"> automatically from this file.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Watchparty",
    short_name: "Watchparty",
    description:
      "The ultimate destination for live streaming and community engagement.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
