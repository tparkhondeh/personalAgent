import type { Metadata } from "next";
import "vazirmatn/Vazirmatn-Variable-font-face.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "همراه | دستیار شخصی هوشمند",
  description: "مدیریت آرام و هوشمند کارها، جلسات و برنامه روزانه",
  applicationName: "همراه",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "همراه" },
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
