import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { UpdateBanner } from "@/components/update-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "1st Penguin", template: "%s | 1st Penguin" },
  description: "起業部内限定の名刺管理・お礼メール支援PWA",
  applicationName: "1st Penguin",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "1st Penguin" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0b84d8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full"><ServiceWorkerRegistration /><AppShell>{children}</AppShell><UpdateBanner /></body>
    </html>
  );
}
