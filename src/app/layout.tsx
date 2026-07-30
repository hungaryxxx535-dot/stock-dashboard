import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { FloatingNavigation } from "@/components/floating-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "非哥股票作战台",
  description: "手机优先的股票持仓、市场情报、A股与美股多维分析、交易复盘及行情作战平台",
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
      <body>
        {children}
        <FloatingNavigation />
      </body>
    </html>
  );
}
