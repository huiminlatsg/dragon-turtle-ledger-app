import type { MetadataRoute } from "next";
import { BRAND_COLOR } from "@/lib/brand/icon";
import { appName, appShortName } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${appName} — family expenses`,
    short_name: appShortName,
    description: "Log family spending, track card minimum spend, see where the money goes.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: BRAND_COLOR,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
