import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "非哥股票作战台",
  description: "手机优先的股票持仓 Dashboard / PWA MVP",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "股票作战台" },
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
