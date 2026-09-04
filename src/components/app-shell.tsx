"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BarChart3, BookOpen, Briefcase, Command, Gauge, Home, Menu, PieChart, Search, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

const primary = [
  { href: "/", label: "总览", icon: Home },
  { href: "/portfolio", label: "持仓", icon: Briefcase },
  { href: "/risk", label: "洞察", icon: PieChart },
  { href: "/research", label: "研究", icon: Search },
  { href: "/journal", label: "复盘", icon: BookOpen },
];
const secondary = [
  { href: "/market", label: "市场", icon: BarChart3 },
  { href: "/settings", label: "设置", icon: Settings },
  { href: "/system-status", label: "系统状态", icon: Activity },
  { href: "/portfolio/import", label: "导入中心", icon: Gauge },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(true); }
      if (event.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const active = (href: string) => href === "/" ? path === "/" : path.startsWith(href);
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#191c1f] dark:bg-[#0f1012] dark:text-slate-50">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:p-3">跳到主要内容</a>
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden border-r border-black/5 bg-white transition-all dark:border-white/10 dark:bg-[#191c1f] lg:flex lg:flex-col", collapsed ? "w-20" : "w-64")}>
        <div className="flex h-20 items-center justify-between px-5">
          {!collapsed && <div><p className="text-lg font-semibold tracking-tight">非哥资产中心</p><p className="text-xs text-slate-500">Long-term portfolio</p></div>}
          <button aria-label="收起侧边栏" onClick={() => setCollapsed(!collapsed)} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><Menu className="h-5 w-5" /></button>
        </div>
        <nav aria-label="主导航" className="space-y-1 px-3">{[...primary, ...secondary].map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={label} className={cn("flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition", active(href) ? "bg-[#191c1f] text-white dark:bg-white dark:text-[#191c1f]" : "text-slate-600 hover:bg-[#f0f0f2] dark:text-slate-300 dark:hover:bg-white/5")}><Icon className="h-5 w-5 shrink-0" />{!collapsed && label}</Link>)}</nav>
        <button onClick={() => setPalette(true)} className="mx-3 mt-auto mb-5 flex items-center gap-3 rounded-xl border p-3 text-sm text-slate-500"><Command className="h-5 w-5" />{!collapsed && "命令面板 Ctrl K"}</button>
      </aside>
      <main id="main-content" className={cn("min-h-screen pb-24 transition-all lg:pb-0", collapsed ? "lg:pl-20" : "lg:pl-64")}><div className="mx-auto max-w-7xl p-4 sm:p-7 lg:p-10">{children}</div></main>
      <button aria-label="打开命令面板" onClick={() => setPalette(true)} className="fixed right-4 top-4 z-30 rounded-full bg-[#191c1f] p-3 text-white lg:hidden"><Command className="h-5 w-5" /></button>
      <nav aria-label="移动端主导航" className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-black/5 bg-white/95 px-1 pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#191c1f]/95 lg:hidden">{primary.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium", active(href) ? "text-[#494fdf] dark:text-[#8b8fff]" : "text-slate-500")}><Icon className="h-5 w-5" />{label}</Link>)}</nav>
      {palette && <div role="dialog" aria-modal="true" aria-label="命令面板" className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/50 p-4 pt-20" onMouseDown={() => setPalette(false)}><div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900" onMouseDown={(e) => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 className="font-black">前往功能</h2><button aria-label="关闭" onClick={() => setPalette(false)}><X /></button></div><div className="grid gap-2 sm:grid-cols-2">{[...primary, ...secondary].map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setPalette(false)} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-slate-50 dark:hover:bg-slate-800"><Icon className="h-5 w-5" />{label}</Link>)}</div></div></div>}
    </div>
  );
}
