import type { Metadata, Viewport } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { brand, brandThemeCss } from "@/lib/brand";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: brand.appName,
  description: brand.description,
  icons: {
    icon: [
      { url: brand.icons.icon192, sizes: "192x192", type: "image/png" },
      { url: brand.icons.icon512, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: brand.icons.appleTouch, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: brand.accent,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const themeCss = brandThemeCss();
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        {themeCss && <style>{themeCss}</style>}
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
