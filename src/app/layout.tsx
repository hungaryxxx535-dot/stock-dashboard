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
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
          <a
            href="/us-close"
            className="rounded-full bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-xl shadow-slate-900/15 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            美股收盘
          </a>
          <a
            href="/trade-plan-v2"
            className="rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:bg-slate-800"
          >
            操作线
          </a>
        </div>
      </body>
    </html>
  );
}
