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
  title: { default: "非哥股票作战平台", template: "%s｜非哥股票作战平台" },
  description: "本地优先、移动优先的个人股票研究、计划、风控与复盘工作台。",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "股票作战台" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f8fafc" }, { media: "(prefers-color-scheme: dark)", color: "#020617" }], width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><body><DataProvider><AppShell>{children}</AppShell></DataProvider></body></html>;
}
