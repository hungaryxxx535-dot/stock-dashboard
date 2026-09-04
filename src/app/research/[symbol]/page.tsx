"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePortfolioData } from "@/components/data-provider";
import { describeQuote } from "@/lib/quote-provenance";
import { calculateResearchCompleteness } from "@/lib/research-completeness";

const sections = ["结论摘要", "核心逻辑", "行业与竞争", "商业模式", "财务质量", "估值框架", "盈利预期", "催化剂", "技术结构", "资金与情绪", "组合适配", "主要风险", "反方证据", "失效条件"];
export default function ResearchDetailPage() {
  const { symbol } = useParams<{ symbol: string }>(); const { state } = usePortfolioData();
  const instrument = state.instruments.find((item) => item.symbol === decodeURIComponent(symbol));
  if (!instrument) return <div><h1 className="text-3xl font-black">未找到标的</h1><Link className="mt-4 inline-block text-cyan-600" href="/research">返回研究中心</Link></div>;
  const completeness = calculateResearchCompleteness(state, instrument);
  const quote = state.quotes.find((item) => item.instrumentId === instrument.id) ?? null;
  const provenance = describeQuote(quote);
  const snapshot = state.researchSnapshots.filter((item) => item.scope === "instrument" && [instrument.id, instrument.symbol, instrument.name].includes(item.subject)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const available = new Map<string, string>([
    ["结论摘要", snapshot?.conclusion ?? ""],
    ["核心逻辑", snapshot?.positiveEvidence.join("；") ?? ""],
    ["行业与竞争", instrument.sectors.join("、")],
    ["主要风险", snapshot?.negativeEvidence.join("；") ?? ""],
    ["反方证据", snapshot?.negativeEvidence.join("；") ?? ""],
    ["失效条件", snapshot?.invalidation.join("；") ?? ""],
  ]);
  return <><header className="mb-6"><p className="text-sm font-bold text-cyan-600">{instrument.market} · {instrument.assetType}</p><div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-4xl font-black">{instrument.symbol}</h1><p className="text-slate-500">{instrument.name}</p></div><div className="text-right"><p className="text-3xl font-black">{completeness.score}%</p><p className="text-xs text-slate-500">研究完整度 · {completeness.status}</p></div></div></header><div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-black">当前价格口径：{provenance.label}</p><p className="mt-1">{provenance.detail}</p><p className="mt-2">仍缺：{completeness.missing.join("、") || "无关键缺口"}。数据不足时不生成目标价或交易建议。</p></div><div className="grid gap-4 lg:grid-cols-2">{sections.map((title, index) => { const content = available.get(title) ?? ""; return <section key={title} className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><h2 className="font-black">{index + 1}. {title}</h2><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${content ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{content ? "已有数据" : "数据待补齐"}</span></div><p className="mt-3 text-sm leading-6 text-slate-500">{content || "尚无带来源与时间戳的可审计数据。"}</p></section>; })}</div></>;
}
