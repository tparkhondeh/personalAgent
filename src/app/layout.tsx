import type { Metadata, Viewport } from "next";
import "vazirmatn/Vazirmatn-Variable-font-face.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "همراه | دستیار شخصی هوشمند",
  description: "مدیریت آرام و هوشمند کارها، جلسات و برنامه روزانه",
  applicationName: "همراه",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "همراه" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5c70b4" },
    { media: "(prefers-color-scheme: dark)", color: "#13151f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className="h-full antialiased"
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
