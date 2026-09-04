"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Database, Download, Loader2, Plus, RefreshCw, Upload } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";
import { LongTermInsights } from "@/components/long-term-insights";
import { PortfolioScreenshotImportV2 } from "@/components/portfolio-screenshot-import-v2";
import { calculatePortfolioMetrics } from "@/domain/engines/portfolio-risk-engine";
import { buildMissionControl } from "@/domain/engines/mission-control-engine";
import { buildPeriodReview } from "@/domain/engines/review-engine";
import { canTransitionPlan, transitionTradePlan } from "@/domain/engines/trade-plan-engine";
import type { AppState } from "@/domain/model";
import { loadMarketSummary } from "@/lib/market-summary";
import { isNameOnlySymbol, marketLabel, type EquityMarket } from "@/lib/portfolio-import/screenshot";
import { isSupabaseConfigured } from "@/lib/storage/supabase-adapter";
import { createPortfolioShareUrl } from "@/lib/portfolio-share";
import { describeQuote } from "@/lib/quote-provenance";
import { calculateResearchCompleteness } from "@/lib/research-completeness";
import type { ResearchProfileResponse } from "@/lib/research-profile";

type View = "home" | "portfolio" | "import" | "market" | "research" | "watchlist" | "plans" | "daily" | "risk" | "journal" | "settings";
const money = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
const nativeMoney = (value: number, currency: "CNY" | "USD" | "HKD") => new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const pct = (value: number) => `${value.toFixed(1)}%`;
const quotePct = (price: number | null | undefined, previousClose: number | null | undefined) => price && previousClose ? (price - previousClose) / previousClose * 100 : null;
const signedPct = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const changeTone = (value: number | null) => value === null ? "text-slate-500" : value > 0 ? "text-red-600" : value < 0 ? "text-emerald-600" : "text-slate-500";
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-medium uppercase tracking-[.22em] text-[#494fdf]">Portfolio Intelligence</p><h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p></div>{action}</header>;
}
function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[24px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#191c1f] sm:p-5 ${className}`}>{title && <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>}{children}</section>;
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Panel><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</Panel>;
}
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#191c1f] px-5 text-sm font-medium text-white transition hover:opacity-85 disabled:opacity-50 dark:bg-white dark:text-[#191c1f]";

export function Workbench({ view }: { view: View }) {
  const data = usePortfolioData();
  const metrics = useMemo(() => calculatePortfolioMetrics(data.state), [data.state]);
  if (!data.ready) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" />正在打开本地作战台…</div>;
  if (view === "home") return <HomePage state={data.state} metrics={metrics} error={data.error} />;
  if (view === "portfolio") return <PortfolioPage />;
  if (view === "import") return <ImportPage />;
  if (view === "market") return <MarketPage />;
  if (view === "research") return <ResearchPage />;
  if (view === "watchlist") return <WatchlistPage />;
  if (view === "plans") return <PlansPage />;
  if (view === "daily") return <DailyPage />;
  if (view === "risk") return <RiskPage />;
  if (view === "journal") return <JournalPage />;
  return <SettingsPage />;
}

function HomePage({ state, metrics, error }: { state: AppState; metrics: ReturnType<typeof calculatePortfolioMetrics>; error: string }) {
  const modeLabel = state.mode === "demo" ? "匿名演示" : state.mode === "cloud" ? "云端持仓已连接" : "本地数据";
  const latestQuoteTime = metrics.valuations.map((item) => item.quote?.marketTime).filter((value): value is string => Boolean(value)).sort().at(-1);
  return <><PageHeader title="我的长期组合" description="用配置结构和持仓变化观察长期资产，不设置止损线，也不生成短线交易指令。" action={<Link className={buttonClass} href="/portfolio">查看全部持仓 <ArrowRight className="h-4 w-4" /></Link>} />
    {error && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
    <section className="mb-4 overflow-hidden rounded-[28px] bg-[#191c1f] p-6 text-white sm:p-8"><div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end"><div><p className="text-sm text-white/55">资产总览 · {modeLabel}</p><p className="mt-3 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">{money(metrics.totalAssets)}</p><p className="mt-3 text-sm text-white/55">行情覆盖 {metrics.dataConfidence}%{latestQuoteTime ? ` · 更新至 ${new Date(latestQuoteTime).toLocaleString("zh-CN", { hour12: false })}` : ""}</p></div><div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm"><div><p className="text-white/45">持仓市值</p><p className="mt-1 text-lg font-medium">{money(metrics.investedValue)}</p></div><div><p className="text-white/45">现金</p><p className="mt-1 text-lg font-medium">{money(metrics.cashValue)}</p></div><div><p className="text-white/45">持仓比例</p><p className="mt-1 text-lg font-medium">{pct(metrics.totalPositionPct)}</p></div><div><p className="text-white/45">持仓数量</p><p className="mt-1 text-lg font-medium">{metrics.valuations.length}</p></div></div></div></section>
    <LongTermInsights state={state} metrics={metrics} compact />
  </>;
}

function PortfolioPage() {
  const { state, save, refreshQuotes } = usePortfolioData();
  const [refreshing, setRefreshing] = useState(false);
  const metrics = useMemo(() => calculatePortfolioMetrics(state), [state]);
  const remove = async (holdingId: string) => save((current) => ({ ...current, holdings: current.holdings.map((item) => item.id === holdingId ? { ...item, status: "closed", closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item) }));
  const sections: Array<{ market: EquityMarket; accent: string }> = [
    { market: "CN", accent: "border-t-red-500" },
    { market: "US", accent: "border-t-blue-500" },
    { market: "HK", accent: "border-t-violet-500" },
  ];
  const attributableQuotes = metrics.valuations.filter((item) => item.quote?.price && item.quote.marketTime && !/截图|跨设备持仓|云端持仓/.test(item.quote.source));
  const latestMarketTime = attributableQuotes.map((item) => item.quote?.marketTime).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const refresh = async () => { setRefreshing(true); try { await refreshQuotes(); } finally { setRefreshing(false); } };
  return <><PageHeader title="持仓中心" description="持仓快照与行情分开标注；公开行情会显示来源和市场时间，失败时保留最近一次有效数据。" action={<div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={refreshing} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />刷新行情</button><Link className={buttonClass} href="/portfolio/import"><Upload className="h-4 w-4" />上传持仓截图</Link></div>} />
    <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="投资市值（人民币折算）" value={money(metrics.investedValue)} /><Metric label="现金（人民币折算）" value={money(metrics.cashValue)} /><Metric label="行情覆盖" value={`${attributableQuotes.length}/${metrics.valuations.length}`} note="具有来源、最新价与市场时间" /><Metric label="最近行情时间" value={latestMarketTime ? new Date(latestMarketTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"} note="页面打开后每60秒自动刷新" /></div>
    <div className="space-y-4">
      {sections.map(({ market, accent }) => {
        const items = metrics.valuations.filter((item) => item.instrument.market === market);
        const value = items.reduce((sum, item) => sum + item.valueBase, 0);
        return <section key={market} aria-labelledby={`portfolio-${market}`} className={`rounded-2xl border border-t-4 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 ${accent}`}>
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{market}</p><h2 id={`portfolio-${market}`} className="text-xl font-black">我的{marketLabel(market)}</h2><p className="mt-1 text-sm text-slate-500">{items.length} 项持仓 · 人民币折算 {money(value)}</p></div>
            <Link className="text-sm font-bold text-cyan-700 dark:text-cyan-300" href="/portfolio/import">上传{marketLabel(market)}截图 →</Link>
          </div>
          {!items.length ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center dark:border-slate-700"><p className="font-bold">尚未导入{marketLabel(market)}持仓</p><p className="mt-1 text-sm text-slate-500">上传券商持仓截图即可识别，不需要逐项填写。</p></div> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">标的</th><th>数量</th><th>最新价</th><th>今日涨跌</th><th>券商成本</th><th>经济成本</th><th>折算市值</th><th>行情来源</th><th></th></tr></thead><tbody>{items.map((item) => { const provenance = describeQuote(item.quote); const change = quotePct(item.quote?.price, item.quote?.previousClose); return <tr key={item.holding.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-3 font-bold">{isNameOnlySymbol(item.instrument.symbol) ? item.instrument.name : item.instrument.symbol}<span className="block font-normal text-slate-500">{isNameOnlySymbol(item.instrument.symbol) ? "代码待匹配" : item.instrument.name}</span></td><td>{item.holding.quantity.toLocaleString("zh-CN")}</td><td className="font-black">{item.quote?.price ? nativeMoney(item.quote.price, item.instrument.currency) : "—"}</td><td className={`font-black ${changeTone(change)}`}>{signedPct(change)}</td><td>{nativeMoney(item.holding.brokerCost, item.instrument.currency)}</td><td>{nativeMoney(item.holding.economicCost, item.instrument.currency)}</td><td>{money(item.valueBase)}</td><td><span className={provenance.tone === "good" ? "text-emerald-700" : provenance.tone === "danger" ? "text-red-600" : "text-amber-700"}>{provenance.label}</span><span className="block max-w-56 text-xs text-slate-500">{provenance.detail}</span></td><td><button className="text-red-600" onClick={() => remove(item.holding.id)}>关闭</button></td></tr>; })}</tbody></table></div>
            <div className="space-y-3 md:hidden">{items.map((item) => { const provenance = describeQuote(item.quote); const change = quotePct(item.quote?.price, item.quote?.previousClose); return <article key={item.holding.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{isNameOnlySymbol(item.instrument.symbol) ? item.instrument.name : item.instrument.symbol}</p><p className="text-sm text-slate-500">{isNameOnlySymbol(item.instrument.symbol) ? "代码待匹配" : item.instrument.name}</p></div><div className="text-right"><p className="text-lg font-black">{item.quote?.price ? nativeMoney(item.quote.price, item.instrument.currency) : "—"}</p><p className={`text-sm font-black ${changeTone(change)}`}>{signedPct(change)}</p></div></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">数量</dt><dd className="font-bold">{item.holding.quantity.toLocaleString("zh-CN")}</dd></div><div><dt className="text-xs text-slate-500">折算市值</dt><dd className="font-bold">{money(item.valueBase)}</dd></div><div><dt className="text-xs text-slate-500">券商成本</dt><dd className="font-bold">{nativeMoney(item.holding.brokerCost, item.instrument.currency)}</dd></div><div><dt className="text-xs text-slate-500">经济成本</dt><dd className="font-bold">{nativeMoney(item.holding.economicCost, item.instrument.currency)}</dd></div></dl><p className={`mt-3 text-xs ${provenance.tone === "good" ? "text-emerald-700" : provenance.tone === "danger" ? "text-red-600" : "text-amber-700"}`}>{provenance.label} · {provenance.detail}</p></article>; })}</div>
          </>}
        </section>;
      })}
    </div>
  </>;
}

function ImportPage() {
  const { importBackup, state } = usePortfolioData();
  const [message, setMessage] = useState("");
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      await importBackup(await file.text());
      setMessage("V2 备份已校验并恢复；恢复前状态已自动快照。");
    } catch {
      setMessage("备份恢复失败：文件结构或校验不通过，原数据未改变。");
    }
  };
  return <><PageHeader title="持仓截图导入" description="先选择 A股、美股或港股，再上传券商持仓截图。本地 OCR 识别、逐条核对、一次确认后写入，不再需要手工新增持仓。" action={<Link className={buttonClass} href="/portfolio">返回持仓中心</Link>} />
    <PortfolioScreenshotImportV2 />
    <Panel title="V2 数据备份恢复" className="mt-4"><p className="text-sm leading-6 text-slate-500">这是整站 JSON 备份恢复入口，与持仓截图识别分开。当前数据版本：{state.dataVersions.at(-1)?.label}</p><label className={`${buttonClass} mt-3 cursor-pointer`}><Upload className="h-4 w-4" />选择 V2 JSON 备份<input className="sr-only" type="file" accept=".json,application/json" onChange={(event) => void restore(event.target.files?.[0])} /></label>{message && <p role="status" className="mt-3 text-sm font-bold text-amber-700">{message}</p>}</Panel>
  </>;
}

type MarketResponse = { cards?: Array<{ id: string; name: string; value: number | null; changePct: number | null; source: string; marketTime: string | null; state: string; message: string }>; generatedAt?: string; statuses?: Array<{ name: string; state: string; message: string }> };
function MarketPage() {
  const [result, setResult] = useState<MarketResponse | null>(null); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); fetch("/api/market").then((r) => r.json()).then(setResult).catch(() => setResult({ statuses: [{ name: "市场接口", state: "error", message: "请求失败，未使用静态价格替代。" }] })).finally(() => setLoading(false)); };
  useEffect(load, []);
  return <><PageHeader title="市场雷达" description="行情、宏观与风险指标采用可追踪的降级链路；每张卡片显示来源、市场时间和状态。" action={<button onClick={load} className={buttonClass}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{result?.cards?.map((card) => <Panel key={card.id}><div className="flex items-start justify-between gap-2"><p className="font-bold">{card.name}</p><span title={card.state} className={`h-3 w-3 shrink-0 rounded-full ${card.state === "online" ? "bg-emerald-400" : "bg-amber-200"}`} /></div><p className="mt-4 text-2xl font-black">{card.value === null ? "—" : card.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</p><p className="text-sm text-slate-500">{card.changePct === null ? "涨跌幅缺失" : `${card.changePct > 0 ? "+" : ""}${card.changePct.toFixed(2)}%`}</p><p className="mt-3 text-xs text-slate-500">{card.source} · {card.marketTime ?? "时间缺失"}</p><p className="mt-1 text-xs text-amber-700">{card.message}</p></Panel>)}</div>
    {!loading && !result?.cards?.length && <Panel><div className="flex gap-3"><Database className="text-amber-500" /><div><p className="font-bold">市场数据暂不可用</p><p className="text-sm text-slate-500">页面保持可用，但不会伪造价格。请查看下方数据源状态。</p></div></div></Panel>}
    <div className="mt-4 grid gap-2">{result?.statuses?.map((status) => <div key={status.name} className="rounded-xl border bg-white p-3 text-sm dark:bg-slate-900"><b>{status.name}</b> · {status.state}<span className="ml-2 text-slate-500">{status.message}</span></div>)}</div>
  </>;
}

function ResearchPage() {
  const { state } = usePortfolioData();
  const [profiles, setProfiles] = useState<Record<string, ResearchProfileResponse>>({});

  useEffect(() => {
    const controller = new AbortController();
    const supported = state.instruments.filter((item) => ["CN", "HK", "US"].includes(item.market));
    void Promise.allSettled(supported.map(async (item) => {
      const query = new URLSearchParams({ market: item.market, symbol: item.symbol, name: item.name });
      const response = await fetch(`/api/research-profile?${query}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as ResearchProfileResponse;
      if (!controller.signal.aborted) setProfiles((current) => ({ ...current, [item.id]: payload }));
    }));
    return () => controller.abort();
  }, [state.instruments]);

  return <><PageHeader title="研究中心" description="基础数据覆盖由行情、证券资料与近期资讯计算；研究结论完整度仍严格检查正反证据和失效条件。" action={<Link href="/research/watchlist" className={buttonClass}>观察池</Link>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{state.instruments.map((item) => {
    const completeness = calculateResearchCompleteness(state, item);
    const remote = profiles[item.id];
    const hasClassification = Boolean(remote?.profile?.sector || remote?.profile?.industry);
    const coverage = Math.min(100, completeness.score + (hasClassification && completeness.missing.includes("行业与风格分类") ? 10 : 0) + (remote?.news.length ? 10 : 0));
    const missing = completeness.missing.filter((label) => label !== "行业与风格分类" || !hasClassification);
    const dataLabel = remote ? remote.status === "updated" ? "公开资料已更新" : remote.status === "partial" ? "部分公开资料可用" : "公开资料读取失败" : "正在核验公开资料";
    return <Link key={item.id} href={`/research/${encodeURIComponent(item.symbol)}`}><Panel className="h-full transition hover:-translate-y-1"><p className="text-xs text-slate-500">{item.market} · {item.assetType}</p><div className="mt-2 flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{item.symbol}</h2><p className="text-sm text-slate-500">{item.name}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black dark:bg-slate-800">{coverage}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full ${coverage >= 60 ? "bg-emerald-500" : coverage >= 40 ? "bg-amber-500" : "bg-orange-500"}`} style={{ width: `${coverage}%` }} /></div><p className={`mt-2 text-sm font-bold ${remote?.status === "updated" ? "text-emerald-700" : "text-amber-700"}`}>{dataLabel} →</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">研究待补：{missing.slice(0, 3).join("、") || "无关键缺口"}</p></Panel></Link>;
  })}</div></>;
}
function WatchlistPage() {
  const { state } = usePortfolioData();
  return <><PageHeader title="观察池" description="分数只在数据完整度足够时展示，并保留上一评分与变化原因。" /><Panel><div className="space-y-3">{state.watchlistItems.map((item) => { const instrument = state.instruments.find((x) => x.id === item.instrumentId); return <div key={item.id} className="grid gap-2 rounded-xl border p-4 sm:grid-cols-[1fr_auto]"><div><b>{instrument?.symbol}</b><p className="text-sm text-slate-500">{item.reasons.join("；")}</p><p className="mt-2 text-xs text-amber-700">风险：{item.risks.join("；")}</p></div><div className="text-right"><p className="text-2xl font-black">{item.score ?? "—"}</p><p className="text-xs text-slate-500">置信度 {item.confidence}%</p></div></div>})}</div></Panel></>;
}
function PlansPage() {
  const { state, save } = usePortfolioData();
  const [instrumentId, setInstrumentId] = useState(state.instruments[0]?.id ?? "");
  const [direction, setDirection] = useState<"buy" | "sell" | "hold" | "reduce" | "observe">("observe");
  const [targetPositionPct, setTargetPositionPct] = useState(0);
  const [entryCondition, setEntryCondition] = useState("等待结构与数据确认");
  const [invalidation, setInvalidation] = useState("核心假设失效");
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const statusLabel: Record<AppState["tradePlans"][number]["status"], string> = { draft: "草稿", waiting: "等待条件", actionable: "待执行核验", partially_executed: "部分模拟执行", completed: "已完成", invalidated: "已失效", cancelled: "已取消" };
  const directionLabel: Record<AppState["tradePlans"][number]["direction"], string> = { buy: "买入计划", sell: "卖出计划", hold: "持有计划", reduce: "减仓计划", observe: "观察计划" };
  const transitionLabel: Partial<Record<AppState["tradePlans"][number]["status"], string>> = { waiting: "提交等待", actionable: "条件已满足", partially_executed: "记录部分模拟执行", completed: "标记完成", invalidated: "标记失效", cancelled: "取消计划" };

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("instrument");
    if (!requested || !state.instruments.some((item) => item.id === requested)) return;
    setInstrumentId(requested);
    setDirection("reduce");
    setEntryCondition("风险指标回到纪律线以内后完成处置");
    setInvalidation("风险复核确认原警报已解除或数据口径发生变化");
  }, [state.instruments]);

  const add = async () => {
    const instrument = state.instruments.find((item) => item.id === instrumentId);
    if (!instrument || !entryCondition.trim() || !invalidation.trim() || !validUntil) return setMessage("请补齐标的、入场条件、失效条件和有效期。");
    if (targetPositionPct < 0 || targetPositionPct > state.settings.maxSinglePositionPct) return setMessage(`目标仓位必须在 0% 到单标的上限 ${state.settings.maxSinglePositionPct}% 之间。`);
    const now = new Date().toISOString();
    await save((current) => ({ ...current, tradePlans: [...current.tradePlans, { id: id("plan"), instrumentId, market: instrument.market, direction, planType: direction === "reduce" || direction === "sell" ? "risk_reduction" : "swing", targetPositionPct, entryCondition: entryCondition.trim(), entryRange: "待核验", addCondition: "仅在原计划风险预算内", reduceCondition: "风险规则、止损或失效条件触发", stopLoss: null, takeProfit: null, invalidation: invalidation.trim(), catalysts: [], risks: ["执行前必须复核数据新鲜度与风险预算"], validUntil: new Date(`${validUntil}T23:59:59`).toISOString(), status: "draft", note: "不构成交易建议；仅用于计划约束。", createdAt: now, updatedAt: now }] }));
    setMessage("计划草稿已保存。提交等待前请再次核对条件。 ");
  };

  const setStatus = async (planId: string, next: AppState["tradePlans"][number]["status"]) => {
    try {
      await save((current) => ({ ...current, tradePlans: current.tradePlans.map((plan) => plan.id === planId ? transitionTradePlan(plan, next) : plan) }));
      setMessage(`计划已更新为“${statusLabel[next]}”。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "计划状态更新失败。");
    }
  };

  const orderedPlans = [...state.tradePlans].sort((a, b) => Number(["completed", "invalidated", "cancelled"].includes(a.status)) - Number(["completed", "invalidated", "cancelled"].includes(b.status)) || b.updatedAt.localeCompare(a.updatedAt));
  return <><PageHeader title="交易计划" description="先写条件、风险与失效标准，再进入等待或模拟执行；状态变更受规则约束并保留更新时间。" action={<div className="flex flex-wrap gap-2"><Link className={buttonClass} href="/paper">模拟委托台</Link><Link className={buttonClass} href="/plans/daily">每日流程</Link></div>} />
    <Panel title="新建计划草稿" className="mb-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><label className="text-sm font-bold">标的<select className={`${inputClass} mt-1`} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>{state.instruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select></label><label className="text-sm font-bold">方向<select className={`${inputClass} mt-1`} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>{Object.entries(directionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-bold">目标仓位（%）<input className={`${inputClass} mt-1`} type="number" min="0" max={state.settings.maxSinglePositionPct} value={targetPositionPct} onChange={(e) => setTargetPositionPct(Number(e.target.value))} /></label><label className="text-sm font-bold md:col-span-2">入场或行动条件<input className={`${inputClass} mt-1`} value={entryCondition} onChange={(e) => setEntryCondition(e.target.value)} /></label><label className="text-sm font-bold">有效期<input className={`${inputClass} mt-1`} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label><label className="text-sm font-bold md:col-span-2 xl:col-span-3">失效条件<input className={`${inputClass} mt-1`} value={invalidation} onChange={(e) => setInvalidation(e.target.value)} /></label></div><div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => void add()} className={buttonClass}><Plus className="h-4 w-4" />保存计划草稿</button><p role="status" className="text-sm font-bold text-amber-700 dark:text-amber-300">{message}</p></div></Panel>
    <div className="grid gap-4 lg:grid-cols-2">{orderedPlans.map((plan) => { const instrument = state.instruments.find((item) => item.id === plan.instrumentId); const expired = ["draft", "waiting", "actionable", "partially_executed"].includes(plan.status) && new Date(plan.validUntil).getTime() < Date.now(); const nextStatuses = (["waiting", "actionable", "partially_executed", "completed", "invalidated", "cancelled"] as const).filter((next) => canTransitionPlan(plan.status, next)); return <Panel key={plan.id}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{instrument?.symbol ?? "未知标的"} · {directionLabel[plan.direction]}</p><p className="text-sm text-slate-500">{instrument?.name}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${expired ? "bg-red-100 text-red-700" : "bg-slate-100 dark:bg-slate-800"}`}>{expired ? "已过期" : statusLabel[plan.status]}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">行动条件</dt><dd className="font-bold">{plan.entryCondition}</dd></div><div><dt className="text-xs text-slate-500">目标仓位</dt><dd className="font-bold">{plan.targetPositionPct}%</dd></div><div><dt className="text-xs text-slate-500">失效条件</dt><dd>{plan.invalidation}</dd></div><div><dt className="text-xs text-slate-500">有效期</dt><dd>{new Date(plan.validUntil).toLocaleDateString("zh-CN")}</dd></div></dl>{nextStatuses.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{nextStatuses.filter((next) => !expired || ["invalidated", "cancelled"].includes(next)).map((next) => <button key={next} onClick={() => void setStatus(plan.id, next)} className={next === "invalidated" || next === "cancelled" ? "min-h-10 rounded-xl border px-3 text-sm font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300" : "min-h-10 rounded-xl bg-cyan-600 px-3 text-sm font-bold text-white"}>{transitionLabel[next]}</button>)}</div>}<p className="mt-3 text-xs text-slate-500">更新于 {new Date(plan.updatedAt).toLocaleString("zh-CN")} · 只记录计划与模拟执行，不连接真实券商</p></Panel>; })}</div>
  </>;
}
function DailyPage() {
  const { state, save } = usePortfolioData();
  const mission = useMemo(() => buildMissionControl(state), [state]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const stages: Array<[string, string, string]> = [
    ["08:30", "盘前", "检查隔夜市场、数据源与计划有效期"],
    ["09:25", "开盘", "只执行已满足条件的计划"],
    ["11:30", "午间", "记录偏离，不追逐未经计划的波动"],
    ["15:10", "收盘", "核对持仓与风险变化"],
    ["21:30", "美股", "检查美元暴露和跨市场相关性"],
    ["23:59", "归档", "创建日终快照并生成日复盘"],
  ];

  const archiveToday = async () => {
    setBusy(true);
    setMessage("");
    try {
      const nowIso = new Date().toISOString();
      const marketSummary = await loadMarketSummary();
      const review = buildPeriodReview(state, "daily", { marketSummary });
      const snapshot = {
        id: id("snapshot"),
        versionId: state.dataVersions.at(-1)?.id ?? "unknown",
        createdAt: nowIso,
        reason: "日终归档",
        holdings: structuredClone(state.holdings),
        cashBalances: structuredClone(state.cashBalances),
        transactions: structuredClone(state.transactions),
      };
      await save((current) => ({
        ...current,
        snapshots: [...current.snapshots, snapshot],
        reviews: [...current.reviews, review],
      }));
      setMessage(`归档完成：${review.title} 已生成，日终快照 ${snapshot.id} 已保存。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "归档失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="每日作战流程" description="定时任务未配置密钥时保持手工模式；页面不会因此失效。" />
      <Panel className="mb-4 !border-slate-900 !bg-slate-950 !text-white"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">当前闸门 · {mission.statusLabel}</p><p className="mt-2 font-black">{mission.command}</p></div><Link href="/" className="text-sm font-bold text-cyan-300">处理 {mission.items.length} 项任务 →</Link></div></Panel>
      <Panel>
        <ol className="space-y-4">
          {stages.map(([time, title, detail]) => (
            <li key={time} className="grid grid-cols-[4rem_1fr] gap-3">
              <time className="font-black text-cyan-600">{time}</time>
              <div className="border-l-2 border-cyan-200 pl-4"><b>{title}</b><p className="text-sm text-slate-500">{detail}</p></div>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="今日归档" className="mt-4">
        <p className="mb-3 text-sm text-slate-500">一键完成“23:59 归档”步骤：创建当前持仓/现金/交易的日终快照，并生成当日复盘报告。重复归档每次都会新建快照，不会覆盖历史。</p>
        <button className={buttonClass} disabled={busy} onClick={() => void archiveToday()}>
          <CheckCircle2 className="h-4 w-4" />执行今日归档
        </button>
        {message && <p role="status" className="mt-3 text-sm font-bold text-cyan-700 dark:text-cyan-300">{message}</p>}
        <div className="mt-4 grid gap-2 text-sm">
          <p className="font-bold">数据基线</p>
          <p className="text-slate-500">持仓 {state.holdings.filter((holding) => holding.status === "open" && holding.quantity > 0).length} 项开放 · 快照 {state.snapshots.length} 份 · 复盘报告 {state.reviews.length} 份</p>
        </div>
      </Panel>
    </>
  );
}
function RiskPage() {
  const { state } = usePortfolioData();
  const metrics = useMemo(() => calculatePortfolioMetrics(state), [state]);
  return <><PageHeader title="组合洞察" description="从资产配置、市场分布和持仓集中度观察长期组合，不提供止损线或短线操作建议。" /><LongTermInsights state={state} metrics={metrics} /></>;
}
function JournalPage() {
  const { state, save } = usePortfolioData();
  const [note, setNote] = useState("");
  const [instrumentId, setInstrumentId] = useState(state.instruments[0]?.id ?? "");
  const [planId, setPlanId] = useState("");
  const [actualAction, setActualAction] = useState("观察");
  const [followedPlan, setFollowedPlan] = useState(true);
  const [processQuality, setProcessQuality] = useState<"correct" | "incorrect">("correct");
  const [resultQuality, setResultQuality] = useState<"profit" | "loss" | "flat">("flat");
  const [lesson, setLesson] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const add = () => {
    const instrument = state.instruments.find((item) => item.id === instrumentId);
    const plan = state.tradePlans.find((item) => item.id === planId);
    if (!instrument || !note.trim()) return;
    void save((current) => ({
      ...current,
      journalEntries: [...current.journalEntries, {
        id: id("journal"), instrumentId: instrument.id, planId: plan?.id ?? null, originalThesis: note.trim(),
        plannedAction: plan?.entryCondition ?? "观察", actualAction: actualAction.trim() || "观察", executedAt: new Date().toISOString(), price: 0, quantity: 0, pnl: 0,
        followedPlan, processQuality, resultQuality, strengths: followedPlan ? ["按计划执行并及时记录"] : [], mistakes: followedPlan ? [] : ["执行偏离计划"],
        emotion: "待补充", lessons: lesson.trim() ? [lesson.trim()] : [], nextRules: lesson.trim() ? [lesson.trim()] : [], attachmentRefs: [],
      }],
    }));
    setNote("");
    setLesson("");
  };

  const generate = async (type: "daily" | "weekly" | "monthly") => {
    setBusy(true);
    setMessage("");
    try {
      const marketSummary = await loadMarketSummary();
      const review = buildPeriodReview(state, type, { marketSummary });
      await save((current) => ({ ...current, reviews: [...current.reviews, review] }));
      setMessage(`${review.title} 已生成并保存。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复盘生成失败");
    } finally {
      setBusy(false);
    }
  };

  const reviews = [...state.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestAutomatic = reviews.find((review) => review.id.startsWith("auto-"));

  return (
    <>
      <PageHeader title="复盘日志" description="分开记录过程质量和结果质量，避免只以盈亏评价决策。" />
      <Panel className="mb-4 !border-emerald-300 !bg-emerald-50 dark:!border-emerald-900 dark:!bg-emerald-950/20"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" /><div><p className="font-black">全自动复盘已开启</p><p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">收盘后页面保持打开，或下次打开平台时，自动补生成日复盘；周五同时生成周复盘，月末同时生成月复盘。固定日期只生成一次。</p><p className="mt-2 text-xs text-slate-500">{latestAutomatic ? `最近自动生成：${latestAutomatic.title}` : "首次自动报告将在最近一个已收盘交易日生成；主观心得可选填。"}</p></div></div></Panel>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Panel title="快速记录">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">标的<select aria-label="复盘标的" className={`${inputClass} mt-1`} value={instrumentId} onChange={(e) => { setInstrumentId(e.target.value); setPlanId(""); }}>{state.instruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select></label><label className="text-sm font-bold">关联计划<select aria-label="关联计划" className={`${inputClass} mt-1`} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">未关联计划</option>{state.tradePlans.filter((plan) => plan.instrumentId === instrumentId).map((plan) => <option key={plan.id} value={plan.id}>{plan.entryCondition} · {plan.status}</option>)}</select></label><label className="text-sm font-bold sm:col-span-2">实际行动<input aria-label="实际行动" className={`${inputClass} mt-1`} value={actualAction} onChange={(e) => setActualAction(e.target.value)} /></label><label className="text-sm font-bold">过程质量<select aria-label="过程质量" className={`${inputClass} mt-1`} value={processQuality} onChange={(e) => setProcessQuality(e.target.value as typeof processQuality)}><option value="correct">过程正确</option><option value="incorrect">过程有误</option></select></label><label className="text-sm font-bold">结果质量<select aria-label="结果质量" className={`${inputClass} mt-1`} value={resultQuality} onChange={(e) => setResultQuality(e.target.value as typeof resultQuality)}><option value="profit">盈利</option><option value="loss">亏损</option><option value="flat">持平/未验证</option></select></label></div>
          <label className="mt-3 block text-sm font-bold">原始判断<textarea className={`${inputClass} mt-1 min-h-28 py-3`} placeholder="当时看到了什么、依据是什么…" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="mt-3 block text-sm font-bold">经验或下次规则<input className={`${inputClass} mt-1`} placeholder="可选" value={lesson} onChange={(e) => setLesson(e.target.value)} /></label>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={followedPlan} onChange={(e) => setFollowedPlan(e.target.checked)} />本次行动遵守了关联计划</label>
          <button className={`${buttonClass} mt-3`} onClick={add}>保存复盘</button>
        </Panel>
        <Panel title="历史记录">
          <div className="space-y-3">
            {state.journalEntries.length ? state.journalEntries.map((entry) => (
              <article key={entry.id} className="rounded-xl border p-3">
                <div className="flex justify-between"><b>{state.instruments.find((item) => item.id === entry.instrumentId)?.symbol}</b><time className="text-xs text-slate-500">{new Date(entry.executedAt).toLocaleString("zh-CN")}</time></div>
                <p className="mt-2 text-sm">{entry.originalThesis}</p>
                <p className="mt-2 text-xs text-slate-500">行动：{entry.actualAction} · {entry.followedPlan ? "遵守计划" : "偏离计划"} · 过程：{entry.processQuality} · 结果：{entry.resultQuality}{entry.lessons.length ? ` · 教训：${entry.lessons.join("、")}` : ""}</p>
              </article>
            )) : <p className="text-sm text-slate-500">还没有复盘记录。</p>}
          </div>
        </Panel>
      </div>
      <Panel title="自动复盘报告" className="mt-4">
        <p className="mb-3 text-sm text-slate-500">系统会自动生成；以下按钮只用于临时补做或立即预览。报告根据快照、当前持仓与行情、计划状态和可选日志生成，所有估算和缺失都会注明。</p>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} disabled={busy} onClick={() => void generate("daily")}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />生成日复盘</button>
          <button className={buttonClass} disabled={busy} onClick={() => void generate("weekly")}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />生成周复盘</button>
          <button className={buttonClass} disabled={busy} onClick={() => void generate("monthly")}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />生成月复盘</button>
        </div>
        {message && <p role="status" className="mt-3 text-sm font-bold text-cyan-700 dark:text-cyan-300">{message}</p>}
        {reviews.length === 0 ? <p className="mt-4 text-sm text-slate-500">还没有自动复盘报告。</p> : (
          <div className="mt-4 space-y-3">
            {reviews.map((review) => (
              <details key={review.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <summary className="cursor-pointer font-bold">{review.title}<span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-slate-800">{review.type === "daily" ? "日" : review.type === "weekly" ? "周" : "月"}</span></summary>
                <div className="mt-3 space-y-3 text-sm">
                  <p className="font-bold">{review.summary}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <b>组合表现</b>
                      <p className="mt-1 text-xs text-slate-500">{review.portfolio.note}</p>
                      <p className="mt-1">期初 {review.portfolio.startValue === null ? "—" : money(review.portfolio.startValue)} → 期末 {review.portfolio.endValue === null ? "—" : money(review.portfolio.endValue)}（{review.portfolio.changePct === null ? "—" : `${review.portfolio.changePct >= 0 ? "+" : ""}${review.portfolio.changePct.toFixed(1)}%`}）</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <b>风险</b>
                      <p className="mt-1">总仓位 {pct(review.risk.endPositionPct ?? 0)}（期初 {review.risk.startPositionPct === null ? "—" : pct(review.risk.startPositionPct)}）· 最大单仓 {pct(review.risk.endLargestPct ?? 0)}</p>
                      {review.risk.warnings.length > 0 && <ul className="mt-1 list-inside list-disc text-amber-700">{review.risk.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                    </div>
                  </div>
                  <div>
                    <b>持仓变化（{review.holdings.length}）</b>
                    <div className="mt-1 space-y-1">
                      {review.holdings.filter((holding) => holding.status !== "unchanged").map((holding) => (
                        <p key={holding.instrumentId}>{holding.status === "added" ? "新增" : holding.status === "removed" ? "移除" : "调整"}：{holding.name}（{holding.symbol}）{holding.startQuantity ?? "—"} → {holding.endQuantity} 股{holding.endPrice !== null ? ` · 现价 ${holding.endPrice}` : ""}</p>
                      ))}
                      {!review.holdings.some((holding) => holding.status !== "unchanged") && <p className="text-xs text-slate-500">期内持仓数量无变化。</p>}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <b>计划执行</b>
                      <p className="mt-1">期内创建 {review.plans.created} · 完成 {review.plans.completed} · 失效 {review.plans.invalidated} · 进行中 {review.plans.active}</p>
                      {review.plans.touched.length > 0 && <ul className="mt-1 list-inside list-disc text-xs text-slate-500">{review.plans.touched.map((plan) => <li key={plan.id}>{plan.symbol}：{plan.status}</li>)}</ul>}
                    </div>
                    <div>
                      <b>复盘日志</b>
                      <p className="mt-1">共 {review.journal.count} 条 · 遵守计划 {review.journal.followedPlan} 条 · 过程正确 {review.journal.processCorrect} 条 · 盈利/亏损 {review.journal.resultProfit}/{review.journal.resultLoss}</p>
                      {review.journal.lessons.length > 0 && <ul className="mt-1 list-inside list-disc text-xs text-slate-500">{review.journal.lessons.map((lesson) => <li key={lesson}>{lesson}</li>)}</ul>}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <b>市场环境</b>
                    <p className="mt-1">{review.market.summary}</p>
                    {review.market.notes.length > 0 && <p className="mt-1 text-xs text-slate-500">{review.market.notes.join("；")}</p>}
                    {review.market.source && <p className="mt-1 text-xs text-slate-500">{review.market.source}</p>}
                  </div>
                  {review.dataQuality.length > 0 && (
                    <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/20">
                      <b>数据质量提示</b>
                      <ul className="mt-1 list-inside list-disc">{review.dataQuality.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
function SettingsPage() {
  const { state, save, exportBackup, importBackup, legacyAvailable, migrateLegacy, resetDemo } = usePortfolioData(); const [message, setMessage] = useState(""); const [shareUrl, setShareUrl] = useState("");
  const download = async () => { const raw = await exportBackup(); const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `stock-war-room-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage("加密边界提示：备份包含私有数据，请自行安全保管。"); };
  const upload = async (file?: File) => { if (!file) return; try { await importBackup(await file.text()); setMessage("备份已校验并恢复。"); } catch { setMessage("恢复失败，原数据未改变。"); } };
  const setLimit = (key: "maxTotalPositionPct" | "maxSinglePositionPct" | "maxTechnologyExposurePct", value: number) => save((current) => ({ ...current, settings: { ...current.settings, [key]: value, updatedAt: new Date().toISOString() } }));
  const generateShareUrl = () => { setShareUrl(createPortfolioShareUrl(state, window.location.origin)); setMessage("手机查看链接已生成。链接包含当前持仓数据，请只发给你信任的人。"); };
  return <><PageHeader title="设置与数据安全" description={state.mode === "cloud" ? "当前持仓由 Render 云端快照提供，手机打开普通网址即可自动同步。" : "真实持仓默认只存本机；需要手机查看时，可主动生成一次性跨设备导入链接。"} /><div className="grid gap-4 lg:grid-cols-2"><Panel title="风险参数"><div className="space-y-3">{[["总仓位上限", "maxTotalPositionPct"], ["单标的上限", "maxSinglePositionPct"], ["科技暴露上限", "maxTechnologyExposurePct"]].map(([label, key]) => <label key={key} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">{label}<input type="number" min="0" max="100" className={inputClass} value={state.settings[key as keyof typeof state.settings] as number} onChange={(e) => void setLimit(key as "maxTotalPositionPct" | "maxSinglePositionPct" | "maxTechnologyExposurePct", Number(e.target.value))} /></label>)}</div></Panel><Panel title="手机与跨设备"><p className="text-sm leading-6 text-slate-500">{state.mode === "cloud" ? "云端持仓已启用。任何设备打开普通平台网址都会自动同步最新云端快照。" : "生成的链接会携带当前持仓快照。新设备首次打开后，数据写入该设备的本地数据库，地址栏中的数据随即清除。"}</p><button className={`${buttonClass} mt-3`} onClick={generateShareUrl}>生成手机查看链接</button>{shareUrl && <div className="mt-3 space-y-2"><textarea aria-label="手机查看链接" className={`${inputClass} min-h-28 break-all font-mono text-xs`} readOnly value={shareUrl} /><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setMessage("链接已复制，可发送到手机打开。"))}>复制链接</button><a className={buttonClass} href={shareUrl}>本机验证</a></div></div>}</Panel><Panel title="备份与恢复"><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={download}><Download className="h-4 w-4" />导出 JSON</button><label className={buttonClass}><Upload className="h-4 w-4" />恢复备份<input className="sr-only" type="file" accept=".json,application/json" onChange={(e) => void upload(e.target.files?.[0])} /></label></div>{legacyAvailable && <button className="mt-3 text-sm font-bold text-cyan-600" onClick={() => void migrateLegacy()}>检测到 V1 数据：创建快照并迁移</button>}<p role="status" className="mt-3 text-xs text-amber-700">{message}</p></Panel><Panel title="存储状态"><dl className="grid grid-cols-2 gap-3 text-sm"><dt>当前模式</dt><dd className="text-right font-bold">{state.mode}</dd><dt>本地数据库</dt><dd className="text-right font-bold text-emerald-600">IndexedDB</dd><dt>云同步</dt><dd className="text-right font-bold">{state.mode === "cloud" ? "Render 云端已连接" : isSupabaseConfigured() ? "supabase_ready（已配置）" : "未配置（可用跨设备链接）"}</dd><dt>数据版本</dt><dd className="text-right font-bold">Schema v{state.schemaVersion}</dd></dl></Panel><Panel title="演示与隐私"><p className="text-sm leading-6 text-slate-500">重置只会恢复匿名演示状态；公开仓库不包含真实持仓、账户名、截图或交易记录。</p><button className="mt-3 text-sm font-bold text-red-600" onClick={() => { if (window.confirm("确认用匿名演示数据覆盖当前浏览器数据？请先导出备份。")) void resetDemo(); }}>重置为匿名演示</button></Panel></div></>;
}
