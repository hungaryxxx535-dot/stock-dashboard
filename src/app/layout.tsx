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
      <body>
        {children}
        <a
          href="/trade-plan"
          className="fixed bottom-24 right-4 z-40 rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:bg-slate-800"
        >
          操作线
        </a>
      </body>
    </html>
  );
}
