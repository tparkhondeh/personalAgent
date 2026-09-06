import type { Metadata, Viewport } from "next";
import { appearanceBootstrap } from "@/lib/appearance";
import "vazirmatn/Vazirmatn-Variable-font-face.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "tia | دستیار شخصی هوشمند",
  description: "مدیریت آرام و هوشمند کارها، جلسات و برنامه روزانه",
  applicationName: "tia",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "tia" },
};

export const viewport: Viewport = {
  themeColor: "#f7f7ff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className="h-full antialiased"
      data-theme="light"
      suppressHydrationWarning
    >
      <head><script id="hamrah-appearance" dangerouslySetInnerHTML={{__html:appearanceBootstrap}} /></head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
