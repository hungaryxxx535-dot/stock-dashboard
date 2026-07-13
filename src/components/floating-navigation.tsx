"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  ChevronUp,
  Gauge,
  LineChart,
  Menu,
  ServerCog,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/intelligence", label: "市场情报", icon: Activity, tone: "bg-cyan-600 text-white" },
  { href: "/analysis", label: "A股分析", icon: BarChart3, tone: "bg-violet-600 text-white" },
  { href: "/us-analysis", label: "美股投研", icon: LineChart, tone: "bg-indigo-600 text-white" },
  { href: "/review", label: "交易复盘", icon: BookOpenCheck, tone: "bg-amber-500 text-slate-950" },
  { href: "/system-status", label: "系统状态", icon: ServerCog, tone: "bg-blue-600 text-white" },
  { href: "/a-live", label: "A股盘中", icon: Gauge, tone: "bg-emerald-600 text-white" },
  { href: "/trade-plan-v2", label: "操作线", icon: ChevronUp, tone: "bg-slate-950 text-white" },
] as const;

export function FloatingNavigation() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={panelRef} className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 z-50 flex flex-col items-end gap-2 sm:right-5">
      <div
        className={cn(
          "origin-bottom-right overflow-hidden rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-2xl shadow-slate-900/20 backdrop-blur transition-all duration-200",
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-95 opacity-0",
        )}
        aria-hidden={!open}
      >
        <div className="mb-1 flex items-center justify-between gap-4 px-2 py-1">
          <div>
            <p className="text-sm font-black text-slate-950">快捷导航</p>
            <p className="text-[11px] text-slate-400">点击模块后自动收起</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-950"
            aria-label="收起导航"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid w-[190px] gap-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100"
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-sm", item.tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-14 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-black text-white shadow-2xl shadow-slate-900/30 transition active:scale-95",
          open && "bg-white text-slate-950 ring-1 ring-slate-200",
        )}
        aria-expanded={open}
        aria-label={open ? "收起快捷导航" : "展开快捷导航"}
      >
        {open ? <ChevronDown className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        <span>{open ? "收起" : "导航"}</span>
      </button>
    </div>
  );
}
