import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { BRAND_COLOR } from "@/lib/brand/icon";
import { appName, appShortName } from "@/lib/env";
import { getLang } from "@/lib/i18n-server";
import "./globals.css";

export const metadata: Metadata = {
  title: appName,
  description: "Family expense tracker",
  applicationName: appName,
  appleWebApp: { capable: true, title: appShortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1210" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang === "zh" ? "zh-Hans-SG" : "en-SG"}>
      <body style={{ "--brand": BRAND_COLOR } as CSSProperties}>{children}</body>
    </html>
  );
}
