"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePortfolioData } from "@/components/data-provider";
import { describeQuote } from "@/lib/quote-provenance";
import { calculateResearchCompleteness } from "@/lib/research-completeness";
import type { ResearchProfileResponse } from "@/lib/research-profile";

const sections = ["结论摘要", "核心逻辑", "行业与竞争", "商业模式", "财务质量", "估值框架", "盈利预期", "催化剂", "技术结构", "资金与情绪", "组合适配", "主要风险", "反方证据", "失效条件"];
const statusLabel = { updated: "资料已更新", partial: "部分资料可用", failed: "资料读取失败" } as const;

export default function ResearchDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const { state } = usePortfolioData();
  const instrument = state.instruments.find((item) => item.symbol === decodeURIComponent(symbol));
  const [remote, setRemote] = useState<ResearchProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instrument) return;
    const controller = new AbortController();
    setLoading(true);
    const query = new URLSearchParams({ market: instrument.market, symbol: instrument.symbol, name: instrument.name });
    fetch(`/api/research-profile?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ResearchProfileResponse>;
      })
      .then(setRemote)
      .catch(() => { if (!controller.signal.aborted) setRemote({ status: "failed", fetchedAt: new Date().toISOString(), profile: null, news: [], warnings: ["研究资料接口暂时不可用"] }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [instrument]);

  if (!instrument) return <div><h1 className="text-3xl font-black">未找到标的</h1><Link className="mt-4 inline-block text-cyan-600" href="/research">返回研究中心</Link></div>;
  const completeness = calculateResearchCompleteness(state, instrument);
  const quote = state.quotes.find((item) => item.instrumentId === instrument.id) ?? null;
  const provenance = describeQuote(quote);
  const changePct = quote?.price && quote.previousClose ? (quote.price - quote.previousClose) / quote.previousClose * 100 : null;
  const snapshot = state.researchSnapshots.filter((item) => item.scope === "instrument" && [instrument.id, instrument.symbol, instrument.name].includes(item.subject)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const hasRemoteClassification = Boolean(remote?.profile?.sector || remote?.profile?.industry);
  const coverage = Math.min(100, completeness.score + (hasRemoteClassification && completeness.missing.includes("行业与风格分类") ? 10 : 0) + (remote?.news.length ? 10 : 0));
  const coverageLabel = coverage >= 80 ? "基础数据较完整" : coverage >= 60 ? "基础数据部分完整" : "基础数据待补充";
  const profile = remote?.profile;
  const available = new Map<string, string>([
    ["结论摘要", snapshot?.conclusion ?? ""],
    ["核心逻辑", snapshot?.positiveEvidence.join("；") ?? ""],
    ["行业与竞争", [profile?.sector, profile?.industry].filter(Boolean).join(" · ") || instrument.sectors.join("、")],
    ["商业模式", profile?.mainBusiness ?? ""],
    ["主要风险", snapshot?.negativeEvidence.join("；") ?? ""],
    ["反方证据", snapshot?.negativeEvidence.join("；") ?? ""],
    ["失效条件", snapshot?.invalidation.join("；") ?? ""],
  ]);

  return <>
    <header className="mb-6">
      <p className="text-sm font-bold text-cyan-600">{instrument.market} · {instrument.assetType}</p>
      <div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-4xl font-black">{instrument.symbol}</h1><p className="text-slate-500">{instrument.name}</p></div><div className="text-right"><p className="text-3xl font-black">{coverage}%</p><p className="text-xs text-slate-500">{coverageLabel}</p></div></div>
    </header>

    <div className="mb-4 grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">最新行情</p>
        <div className="mt-3 flex items-end justify-between gap-3"><p className="text-3xl font-black">{quote?.price?.toLocaleString("zh-CN", { maximumFractionDigits: 4 }) ?? "—"} <span className="text-sm text-slate-500">{instrument.currency}</span></p><p className={`font-black ${changePct === null ? "text-slate-500" : changePct >= 0 ? "text-red-600" : "text-emerald-600"}`}>{changePct === null ? "涨跌待补" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}</p></div>
        <p className="mt-3 text-xs text-slate-500">{provenance.detail}</p>
      </section>
      <section className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">证券资料</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800">{loading ? "读取中" : remote ? statusLabel[remote.status] : "待读取"}</span></div>
        <p className="mt-3 font-black">{profile?.organizationName || instrument.name}</p>
        <p className="mt-1 text-sm text-slate-500">{[profile?.sector, profile?.industry].filter(Boolean).join(" · ") || "行业资料待补充"}</p>
        {profile && <a className="mt-3 inline-block text-xs font-bold text-cyan-700" href={profile.sourceUrl} target="_blank" rel="noreferrer">来源：{profile.source} ↗</a>}
      </section>
    </div>

    {profile?.description && <section className="mb-4 rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-black">公司简介</h2><p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{profile.description}</p></section>}

    <section className="mb-4 rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3"><h2 className="font-black">近7日相关资讯</h2><span className="text-xs text-slate-500">仅作证据入口，不自动判定利多利空</span></div>
      {loading ? <p className="mt-3 text-sm text-slate-500">正在读取公开资讯…</p> : remote?.news.length ? <ul className="mt-3 divide-y dark:divide-slate-800">{remote.news.map((item) => <li key={`${item.url}-${item.title}`} className="py-3"><a href={item.url} target="_blank" rel="noreferrer" className="font-bold hover:text-cyan-700">{item.title}</a><p className="mt-1 text-xs text-slate-500">{item.publisher}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString("zh-CN", { hour12: false })}` : ""}</p></li>)}</ul> : <p className="mt-3 text-sm text-amber-700">过去7天没有取得可验证的匹配资讯。</p>}
      {remote?.warnings.length ? <p className="mt-3 text-xs text-amber-700">数据缺口：{remote.warnings.join("；")}</p> : null}
    </section>

    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">仍未形成完整投资结论</p><p className="mt-1">当前价格口径：{provenance.label}。支持证据、反方证据、估值和失效条件不足时，不生成目标价或买卖建议。</p></div>
    <div className="grid gap-4 lg:grid-cols-2">{sections.map((title, index) => { const content = available.get(title) ?? ""; return <section key={title} className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><h2 className="font-black">{index + 1}. {title}</h2><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${content ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{content ? "已有数据" : "数据待补齐"}</span></div><p className="mt-3 text-sm leading-6 text-slate-500">{content || "尚无带来源与时间戳的可审计数据。"}</p></section>; })}</div>
  </>;
}
