import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workcrest",
    short_name: "Workcrest",
    description: "Workcrest business workspace",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      { src: "/workcrest-rising-crest-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/workcrest-rising-crest-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
