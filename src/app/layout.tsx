import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { DataProvider } from "@/components/data-provider";
import "./globals.css";

// The dashboard reads cloud holdings and market data after load. Serving a
// year-old prerendered shell makes phones appear stuck on an earlier release,
// so application pages must always receive the current deployment shell.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: { default: "非哥资产中心", template: "%s｜非哥资产中心" },
  description: "面向长期持有的个人资产配置、持仓研究与自动复盘中心。",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "非哥资产中心" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f5f7" }, { media: "(prefers-color-scheme: dark)", color: "#0f1012" }], width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><body><DataProvider><AppShell>{children}</AppShell></DataProvider></body></html>;
}
