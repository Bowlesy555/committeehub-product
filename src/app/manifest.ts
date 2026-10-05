import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CommitteeHub",
    short_name: "CommitteeHub",
    description: "Committee spaces, decisions, tasks and skills",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F5F6F1",
    theme_color: "#2E6F5C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
