import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.appName,
    short_name: brand.shortName,
    description: brand.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F5F6F1",
    theme_color: brand.accent,
    icons: [
      { src: brand.icons.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: brand.icons.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: brand.icons.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
