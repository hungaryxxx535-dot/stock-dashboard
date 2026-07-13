import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "非哥股票作战台",
  description: "手机优先的股票持仓、市场情报、A股与美股分析、交易复盘与行情作战平台",
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
      if (text === "静态 MVP · 手机端以底部导航为主 · 不接真实行情") node.nodeValue = "首页为静态持仓总览 · 市场情报、A股盘中、美股分析与港股模块已配置";
      if (text === "静态持仓，不是实时行情。") node.nodeValue = "首页持仓为静态总览；外部环境请看市场情报和美股分析，价格请看行情页。";
      if (text === "A股静态持仓") node.nodeValue = "A股持仓总览";
      if (text === "按第一轮 MVP 指定清单展示，价格与盈亏均为模拟数据。") node.nodeValue = "这里是持仓结构总览；盘中实时价格请点右下角 A股盘中查看。";
      if (text === "美股静态持仓") node.nodeValue = "美股持仓总览";
      if (text === "美元市值按设置中的汇率折算成人民币计算；所有行情为 Mock 数据。") node.nodeValue = "这里是美股持仓结构总览；宏观与新闻判断请进入美股分析，收盘价请进入美股收盘。";
      if (text === "三项静态判断") node.nodeValue = "三项风险判断";
      if (text === "不接实时行情，仅用于第一轮 UI 验收的风险提醒。") node.nodeValue = "首页风险判断基于持仓；宏观、市场局势与新闻请进入对应分析页。";
      if (text === "用于记录买卖原因和结果复盘，MVP 先使用静态数据。") node.nodeValue = "用于记录买卖原因和结果复盘；行情与外部市场情报已单独联网。";
    }
  }

  function injectHongKongTab() {
    if (location.pathname !== "/") return;
    if (document.querySelector('[data-hk-bottom-tab="true"]')) return;

    var bottomNav = document.querySelector('nav[aria-label="底部主导航"]');
    if (!bottomNav) return;
    var grid = bottomNav.querySelector('div');
    if (!grid) return;

    grid.classList.remove('grid-cols-6');
    grid.classList.add('grid-cols-7');

    var buttons = Array.prototype.slice.call(grid.children);
    var aShareButton = buttons.find(function (el) { return (el.textContent || '').indexOf('A股') >= 0; });
    var usButton = buttons.find(function (el) { return (el.textContent || '').indexOf('美股') >= 0; });
    if (!aShareButton || !usButton) return;

    var hk = document.createElement('a');
    hk.href = '/hk';
    hk.setAttribute('data-hk-bottom-tab', 'true');
    hk.className = 'flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950';
    hk.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><line x1="3" x2="21" y1="22" y2="22"></line><line x1="6" x2="6" y1="18" y2="11"></line><line x1="10" x2="10" y1="18" y2="11"></line><line x1="14" x2="14" y1="18" y2="11"></line><line x1="18" x2="18" y1="18" y2="11"></line><polygon points="12 2 20 7 4 7"></polygon></svg><span>港股</span>';
    grid.insertBefore(hk, usButton);
  }

  function run() {
    replaceText();
    injectHongKongTab();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
  setTimeout(run, 300);
  setTimeout(run, 1200);
  setTimeout(run, 2500);
})();
            `,
          }}
        />
        <div className="fixed bottom-24 right-4 z-40 flex max-h-[calc(100vh-7rem)] flex-col items-end gap-2 overflow-y-auto">
          <a
            href="/us-analysis"
            className="rounded-full bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-indigo-900/20 transition hover:bg-indigo-700"
          >
            美股分析
          </a>
          <a
            href="/intelligence"
            className="rounded-full bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-cyan-900/20 transition hover:bg-cyan-700"
          >
            市场情报
          </a>
          <a
            href="/analysis"
            className="rounded-full bg-violet-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-violet-900/20 transition hover:bg-violet-700"
          >
            多维分析
          </a>
          <a
            href="/review"
            className="rounded-full bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 shadow-xl shadow-amber-900/20 transition hover:bg-amber-400"
          >
            交易复盘
          </a>
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
