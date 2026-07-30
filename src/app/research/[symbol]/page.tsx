"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePortfolioData } from "@/components/data-provider";

const sections = ["结论摘要", "核心逻辑", "行业与竞争", "商业模式", "财务质量", "估值框架", "盈利预期", "催化剂", "技术结构", "资金与情绪", "组合适配", "主要风险", "反方证据", "失效条件"];
export default function ResearchDetailPage() {
  const { symbol } = useParams<{ symbol: string }>(); const { state } = usePortfolioData();
  const instrument = state.instruments.find((item) => item.symbol === decodeURIComponent(symbol));
  if (!instrument) return <div><h1 className="text-3xl font-black">未找到标的</h1><Link className="mt-4 inline-block text-cyan-600" href="/research">返回研究中心</Link></div>;
  return <><header className="mb-6"><p className="text-sm font-bold text-cyan-600">{instrument.market} · {instrument.assetType}</p><h1 className="mt-2 text-4xl font-black">{instrument.symbol}</h1><p className="text-slate-500">{instrument.name}</p></header><div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">研究框架已就绪，但基本面、估值和实时行情尚未完整接入。当前不生成评分、目标价或交易建议。</div><div className="grid gap-4 lg:grid-cols-2">{sections.map((title, index) => <section key={title} className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="font-black">{index + 1}. {title}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800">数据待补齐</span></div><p className="mt-3 text-sm leading-6 text-slate-500">缺失字段已显式标记。补齐带来源与时间戳的数据后，才能形成可审计结论。</p></section>)}</div></>;
}
