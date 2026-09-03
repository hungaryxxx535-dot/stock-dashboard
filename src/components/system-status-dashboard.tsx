"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";
import { isSupabaseConfigured } from "@/lib/storage/supabase-adapter";

type PaperHealth = { available: boolean; environment: string; message?: string; system?: { scheduler_enabled?: boolean; real_broker_connected?: boolean; migrations?: string[] } };

export function SystemStatusDashboard() {
  const { state } = usePortfolioData();
  const [paper, setPaper] = useState<PaperHealth | null>(null);
  const load = useCallback(async () => { try { const response = await fetch("/api/paper/status", { cache: "no-store" }); setPaper(await response.json()); } catch { setPaper({ available: false, environment: "paper", message: "本机 Paper 服务不可达。" }); } }, []);
  useEffect(() => { void load(); }, [load]);
  const okay = state.dataSourceStatuses.filter((item) => item.state === "online").length;
  return <><header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-600">Operations</p><h1 className="text-3xl font-black sm:text-4xl">系统与数据健康</h1><p className="mt-2 text-sm text-slate-500">集中检查本地数据、行情来源、云同步和 Paper 服务；失败状态不会用演示数据伪装成功。</p></div><button onClick={() => void load()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-cyan-400 dark:text-slate-950"><RefreshCw className="h-4 w-4" />刷新状态</button></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["本地数据", "正常", `Schema v${state.schemaVersion} · ${state.mode}`], ["行情源", `${okay}/${state.dataSourceStatuses.length} 在线`, "逐源显示真实状态"], ["云同步", isSupabaseConfigured() ? "已配置" : "未配置", "未配置时保持本地模式"], ["Paper Broker", paper?.available ? "可用" : "未就绪", paper?.available ? "仅限本机模拟交易" : paper?.message ?? "检查中"]].map(([label, value, note]) => <section key={label} className="rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></section>)}</div>
    <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-black">数据源明细</h2><div className="mt-3 space-y-2">{state.dataSourceStatuses.map((source) => <article key={source.id} className="grid gap-2 rounded-xl border p-3 text-sm md:grid-cols-[1fr_auto]"><div><b>{source.name}</b><p className="mt-1 text-slate-500">{source.message}</p></div><div className="md:text-right"><p className={source.state === "online" ? "font-bold text-emerald-600" : "font-bold text-amber-600"}>{source.state}</p><p className="text-xs text-slate-500">{source.source} · {source.marketTime ?? "数据时间缺失"}</p></div></article>)}</div></section>
    <section className="mt-4 rounded-2xl border border-slate-900 bg-slate-950 p-4 text-white"><h2 className="font-black">交易安全状态</h2><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-slate-400">运行环境</dt><dd className="font-black">PAPER</dd></div><div><dt className="text-slate-400">真实券商连接</dt><dd className="font-black">{paper?.system?.real_broker_connected ? "异常：已连接" : "未连接"}</dd></div><div><dt className="text-slate-400">自动调度</dt><dd className="font-black">{paper?.system?.scheduler_enabled ? "已启用，需复核" : "关闭"}</dd></div></dl></section>
  </>;
}
