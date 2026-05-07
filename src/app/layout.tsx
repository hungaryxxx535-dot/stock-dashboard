import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "非哥股票作战台",
  description: "手机优先的股票持仓 Dashboard / A股盘中与美股收盘行情已接入",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  function replaceText() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue || "";
      if (text === "模拟数据 / Mock 数据") node.nodeValue = "持仓总览 / 行情已接入";
      if (text === "静态 MVP · 手机端以底部导航为主 · 不接真实行情") node.nodeValue = "首页为静态持仓总览 · A股盘中与美股收盘已接入行情";
      if (text === "静态持仓，不是实时行情。") node.nodeValue = "首页持仓为静态总览；实时行情请点右下角 A股盘中 / 美股收盘。";
      if (text === "三项静态判断") node.nodeValue = "三项风险判断";
      if (text === "不接实时行情，仅用于第一轮 UI 验收的风险提醒。") node.nodeValue = "首页风险判断基于静态持仓；盘中价格以 A股盘中页为准。";
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", replaceText);
  } else {
    replaceText();
  }
  setTimeout(replaceText, 300);
  setTimeout(replaceText, 1200);
})();
            `,
          }}
        />
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
          <a
            href="/system-status"
            className="rounded-full bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-blue-900/20 transition hover:bg-blue-700"
          >
            系统状态
          </a>
          <a
            href="/a-live"
            className="rounded-full bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-emerald-900/20 transition hover:bg-emerald-700"
          >
            A股盘中
          </a>
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
