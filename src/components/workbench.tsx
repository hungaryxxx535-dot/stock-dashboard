"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Database, Download, Loader2, Plus, RefreshCw, ShieldAlert, Upload } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";
import { PortfolioScreenshotImportV2 } from "@/components/portfolio-screenshot-import-v2";
import { calculatePortfolioMetrics, runStressTests } from "@/domain/engines/portfolio-risk-engine";
import { buildMissionControl, type MissionSeverity } from "@/domain/engines/mission-control-engine";
import { buildPeriodReview } from "@/domain/engines/review-engine";
import type { AppState } from "@/domain/model";
import { loadMarketSummary } from "@/lib/market-summary";
import { isNameOnlySymbol, marketLabel, type EquityMarket } from "@/lib/portfolio-import/screenshot";
import { isSupabaseConfigured } from "@/lib/storage/supabase-adapter";

type View = "home" | "portfolio" | "import" | "market" | "research" | "watchlist" | "plans" | "daily" | "risk" | "journal" | "settings";
const money = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
const nativeMoney = (value: number, currency: "CNY" | "USD" | "HKD") => new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const pct = (value: number) => `${value.toFixed(1)}%`;
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-cyan-600">Stock War Room V2</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p></div>{action}</header>;
}
function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 ${className}`}>{title && <h2 className="mb-4 text-lg font-black">{title}</h2>}{children}</section>;
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Panel><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</Panel>;
}
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50 dark:bg-cyan-400 dark:text-slate-950";

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
  const mission = useMemo(() => buildMissionControl(state), [state]);
  const severityStyle: Record<MissionSeverity, string> = {
    blocker: "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100",
    critical: "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100",
    warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100",
    info: "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
  };
  return <><PageHeader title="今日作战台" description="先看数据质量，再看风险与计划。所有金额均为本机数据计算，公开部署只含匿名演示状态。" action={<Link className={buttonClass} href="/plans/daily">查看日程 <ArrowRight className="h-4 w-4" /></Link>} />
    {error && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
    <Panel className="mb-4 !border-slate-900 !bg-slate-950 !text-white dark:!border-cyan-400"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">今日总指令 · {mission.statusLabel}</p><p className="mt-3 text-xl font-black">{mission.command}</p><p className="mt-2 text-sm text-slate-300">数据置信度 {metrics.dataConfidence}% · 模式 {state.mode === "demo" ? "匿名演示" : "本地私有"}</p></div><div className="shrink-0 rounded-2xl border border-white/20 px-5 py-3 text-center"><p className="text-3xl font-black">{mission.readinessScore}</p><p className="text-xs text-slate-300">决策准备度</p></div></div></Panel>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="总资产估算" value={money(metrics.totalAssets)} note="缺失行情时使用经济成本估算" /><Metric label="整体仓位" value={pct(metrics.totalPositionPct)} note={`上限 ${state.settings.maxTotalPositionPct}%`} /><Metric label="最大单仓" value={pct(metrics.largestHoldingPct)} note={`上限 ${state.settings.maxSinglePositionPct}%`} /><Metric label="科技暴露" value={pct(metrics.technologyExposurePct)} note={`上限 ${state.settings.maxTechnologyExposurePct}%`} /></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]"><Panel title={`今日任务 · ${mission.items.length}`}><div className="space-y-3">{mission.items.slice(0, 6).map((item) => <article key={item.id} className={`rounded-xl border p-3 ${severityStyle[item.severity]}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.title}</p><p className="mt-1 text-sm opacity-75">{item.reason}</p></div><Link href={item.href} className="shrink-0 text-sm font-bold">{item.actionLabel} →</Link></div></article>)}</div></Panel><Panel title="作战闸门"><dl className="grid grid-cols-2 gap-3 text-sm"><dt>阻断项</dt><dd className="text-right font-black text-red-600">{mission.counts.blocker}</dd><dt>严重项</dt><dd className="text-right font-black text-orange-600">{mission.counts.critical}</dd><dt>预警项</dt><dd className="text-right font-black text-amber-600">{mission.counts.warning}</dd><dt>提醒项</dt><dd className="text-right font-black">{mission.counts.info}</dd></dl><p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">任务由持仓行情、风险规则、计划有效期、未处理警报和复盘完整度自动生成。准备度只表示流程是否齐备，不预测涨跌，也不是交易建议。</p></Panel></div>
  </>;
}

function PortfolioPage() {
  const { state, save } = usePortfolioData();
  const metrics = useMemo(() => calculatePortfolioMetrics(state), [state]);
  const remove = async (holdingId: string) => save((current) => ({ ...current, holdings: current.holdings.map((item) => item.id === holdingId ? { ...item, status: "closed", closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item) }));
  const sections: Array<{ market: EquityMarket; accent: string }> = [
    { market: "CN", accent: "border-t-red-500" },
    { market: "US", accent: "border-t-blue-500" },
    { market: "HK", accent: "border-t-violet-500" },
  ];
  return <><PageHeader title="持仓中心" description="A股、美股、港股分开管理。新增持仓统一通过券商截图识别导入，避免逐项手工录入。" action={<Link className={buttonClass} href="/portfolio/import"><Upload className="h-4 w-4" />上传持仓截图</Link>} />
    <div className="mb-4 grid gap-4 sm:grid-cols-3"><Metric label="投资市值（人民币折算）" value={money(metrics.investedValue)} /><Metric label="现金（人民币折算）" value={money(metrics.cashValue)} /><Metric label="开放持仓" value={`${metrics.valuations.length} 项`} /></div>
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
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">标的</th><th>数量</th><th>券商成本</th><th>经济成本</th><th>折算市值</th><th>数据口径</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.holding.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-3 font-bold">{isNameOnlySymbol(item.instrument.symbol) ? item.instrument.name : item.instrument.symbol}<span className="block font-normal text-slate-500">{isNameOnlySymbol(item.instrument.symbol) ? "代码待匹配" : item.instrument.name}</span></td><td>{item.holding.quantity.toLocaleString("zh-CN")}</td><td>{nativeMoney(item.holding.brokerCost, item.instrument.currency)}</td><td>{nativeMoney(item.holding.economicCost, item.instrument.currency)}</td><td>{money(item.valueBase)}</td><td>{item.estimated ? <span className="text-amber-700">成本估算</span> : <span className="text-emerald-700">截图现价</span>}</td><td><button className="text-red-600" onClick={() => remove(item.holding.id)}>关闭</button></td></tr>)}</tbody></table></div>
            <div className="space-y-3 md:hidden">{items.map((item) => <article key={item.holding.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{isNameOnlySymbol(item.instrument.symbol) ? item.instrument.name : item.instrument.symbol}</p><p className="text-sm text-slate-500">{isNameOnlySymbol(item.instrument.symbol) ? "代码待匹配" : item.instrument.name}</p></div><button className="text-sm font-bold text-red-600" onClick={() => remove(item.holding.id)}>关闭</button></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">数量</dt><dd className="font-bold">{item.holding.quantity.toLocaleString("zh-CN")}</dd></div><div><dt className="text-xs text-slate-500">券商成本</dt><dd className="font-bold">{nativeMoney(item.holding.brokerCost, item.instrument.currency)}</dd></div><div><dt className="text-xs text-slate-500">经济成本</dt><dd className="font-bold">{nativeMoney(item.holding.economicCost, item.instrument.currency)}</dd></div><div><dt className="text-xs text-slate-500">折算市值</dt><dd className="font-bold">{money(item.valueBase)}</dd></div></dl><p className={`mt-3 text-xs ${item.estimated ? "text-amber-700" : "text-emerald-700"}`}>{item.estimated ? "缺少有效价格，暂按经济成本估算" : "使用用户确认的截图价格或有效行情"}</p></article>)}</div>
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
  return <><PageHeader title="研究中心" description="候选标的必须说明证据、反证、数据缺口与失效条件；没有数据时只展示结构，不生成虚假评分。" action={<Link href="/research/watchlist" className={buttonClass}>观察池</Link>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{state.instruments.map((item) => <Link key={item.id} href={`/research/${encodeURIComponent(item.symbol)}`}><Panel className="h-full transition hover:-translate-y-1"><p className="text-xs text-slate-500">{item.market} · {item.assetType}</p><h2 className="mt-2 text-xl font-black">{item.symbol}</h2><p className="text-sm text-slate-500">{item.name}</p><p className="mt-4 text-sm text-amber-700">数据完整度待核验 →</p></Panel></Link>)}</div></>;
}
function WatchlistPage() {
  const { state } = usePortfolioData();
  return <><PageHeader title="观察池" description="分数只在数据完整度足够时展示，并保留上一评分与变化原因。" /><Panel><div className="space-y-3">{state.watchlistItems.map((item) => { const instrument = state.instruments.find((x) => x.id === item.instrumentId); return <div key={item.id} className="grid gap-2 rounded-xl border p-4 sm:grid-cols-[1fr_auto]"><div><b>{instrument?.symbol}</b><p className="text-sm text-slate-500">{item.reasons.join("；")}</p><p className="mt-2 text-xs text-amber-700">风险：{item.risks.join("；")}</p></div><div className="text-right"><p className="text-2xl font-black">{item.score ?? "—"}</p><p className="text-xs text-slate-500">置信度 {item.confidence}%</p></div></div>})}</div></Panel></>;
}
function PlansPage() {
  const { state, save } = usePortfolioData(); const [instrumentId, setInstrumentId] = useState(state.instruments[0]?.id ?? "");
  const add = () => { const now = new Date().toISOString(); const instrument = state.instruments.find((item) => item.id === instrumentId); if (!instrument) return; void save((current) => ({ ...current, tradePlans: [...current.tradePlans, { id: id("plan"), instrumentId, market: instrument.market, direction: "observe", planType: "swing", targetPositionPct: 0, entryCondition: "等待结构确认", entryRange: "未设置", addCondition: "未设置", reduceCondition: "风险规则触发时复核", stopLoss: null, takeProfit: null, invalidation: "核心假设失效", catalysts: [], risks: ["数据待补齐"], validUntil: new Date(Date.now() + 30 * 86400000).toISOString(), status: "draft", note: "", createdAt: now, updatedAt: now }] })); };
  const advance = (planId: string) => save((current) => ({ ...current, tradePlans: current.tradePlans.map((plan) => plan.id === planId ? { ...plan, status: plan.status === "draft" ? "waiting" : plan.status === "waiting" ? "actionable" : "completed", updatedAt: new Date().toISOString() } : plan) }));
  return <><PageHeader title="交易计划" description="从草稿、等待、可执行到完成或失效，全程保留条件与状态。" action={<Link className={buttonClass} href="/plans/daily">每日流程</Link>} /><Panel className="mb-4"><div className="flex flex-col gap-2 sm:flex-row"><select className={inputClass} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>{state.instruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select><button onClick={add} className={buttonClass}><Plus className="h-4 w-4" />新建观察计划</button></div></Panel><div className="grid gap-4 lg:grid-cols-2">{state.tradePlans.map((plan) => <Panel key={plan.id}><div className="flex items-center justify-between"><b>{state.instruments.find((item) => item.id === plan.instrumentId)?.symbol}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{plan.status}</span></div><p className="mt-3 text-sm">{plan.entryCondition}</p><p className="mt-2 text-xs text-slate-500">失效：{plan.invalidation}</p>{!["completed", "invalidated", "cancelled"].includes(plan.status) && <button onClick={() => advance(plan.id)} className="mt-4 text-sm font-bold text-cyan-600">推进状态 →</button>}</Panel>)}</div></>;
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
  const { state } = usePortfolioData(); const metrics = useMemo(() => calculatePortfolioMetrics(state), [state]); const stress = useMemo(() => runStressTests(state, metrics), [state, metrics]);
  const warnings = [{ name: "总仓位", value: metrics.totalPositionPct, max: state.settings.maxTotalPositionPct }, { name: "最大单仓", value: metrics.largestHoldingPct, max: state.settings.maxSinglePositionPct }, { name: "科技暴露", value: metrics.technologyExposurePct, max: state.settings.maxTechnologyExposurePct }];
  return <><PageHeader title="风险中心" description="集中度、相关性、汇率和压力测试均基于统一组合口径；缺失行情时明确标注估算。" /><div className="mb-4 grid gap-4 sm:grid-cols-3">{warnings.map((item) => <Panel key={item.name}><div className="flex justify-between"><b>{item.name}</b>{item.value > item.max ? <ShieldAlert className="text-red-600" /> : <CheckCircle2 className="text-emerald-600" />}</div><p className="mt-3 text-2xl font-black">{pct(item.value)}</p><p className="text-xs text-slate-500">规则上限 {item.max}%</p></Panel>)}</div><Panel title="压力测试"><div className="grid gap-3 lg:grid-cols-2">{stress.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><b>{item.name}</b><span className={item.severity === "high" ? "text-red-600" : "text-amber-600"}>{pct(item.impactPct)}</span></div><p className="text-sm text-slate-500">{money(item.impactAmount)} · {item.assumptions.join("；")}</p></div>)}</div></Panel></>;
}
function JournalPage() {
  const { state, save } = usePortfolioData();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const add = () => {
    const instrument = state.instruments[0];
    if (!instrument || !note.trim()) return;
    void save((current) => ({
      ...current,
      journalEntries: [...current.journalEntries, {
        id: id("journal"), instrumentId: instrument.id, planId: null, originalThesis: note,
        plannedAction: "观察", actualAction: "观察", executedAt: new Date().toISOString(), price: 0, quantity: 0, pnl: 0,
        followedPlan: true, processQuality: "correct", resultQuality: "flat", strengths: ["记录及时"], mistakes: [],
        emotion: "平静", lessons: [], nextRules: [], attachmentRefs: [],
      }],
    }));
    setNote("");
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

  return (
    <>
      <PageHeader title="复盘日志" description="分开记录过程质量和结果质量，避免只以盈亏评价决策。" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Panel title="快速记录">
          <textarea className={`${inputClass} min-h-32 py-3`} placeholder="原始判断、执行偏差或新规则…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={`${buttonClass} mt-3`} onClick={add}>保存复盘</button>
        </Panel>
        <Panel title="历史记录">
          <div className="space-y-3">
            {state.journalEntries.length ? state.journalEntries.map((entry) => (
              <article key={entry.id} className="rounded-xl border p-3">
                <div className="flex justify-between"><b>{state.instruments.find((item) => item.id === entry.instrumentId)?.symbol}</b><time className="text-xs text-slate-500">{new Date(entry.executedAt).toLocaleString("zh-CN")}</time></div>
                <p className="mt-2 text-sm">{entry.originalThesis}</p>
                <p className="mt-2 text-xs text-slate-500">过程：{entry.processQuality} · 结果：{entry.resultQuality}{entry.lessons.length ? ` · 教训：${entry.lessons.join("、")}` : ""}</p>
              </article>
            )) : <p className="text-sm text-slate-500">还没有复盘记录。</p>}
          </div>
        </Panel>
      </div>
      <Panel title="自动周/月复盘" className="mt-4">
        <p className="mb-3 text-sm text-slate-500">根据导入快照、当前持仓与行情、计划状态和复盘日志自动生成；所有估算和缺失都会在报告里注明。</p>
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
  const { state, save, exportBackup, importBackup, legacyAvailable, migrateLegacy, resetDemo } = usePortfolioData(); const [message, setMessage] = useState("");
  const download = async () => { const raw = await exportBackup(); const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `stock-war-room-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage("加密边界提示：备份包含私有数据，请自行安全保管。"); };
  const upload = async (file?: File) => { if (!file) return; try { await importBackup(await file.text()); setMessage("备份已校验并恢复。"); } catch { setMessage("恢复失败，原数据未改变。"); } };
  const setLimit = (key: "maxTotalPositionPct" | "maxSinglePositionPct" | "maxTechnologyExposurePct", value: number) => save((current) => ({ ...current, settings: { ...current.settings, [key]: value, updatedAt: new Date().toISOString() } }));
  return <><PageHeader title="设置与数据安全" description="真实持仓默认只存本机。云同步仅提供适配器，未配置 Supabase 时保持关闭。" /><div className="grid gap-4 lg:grid-cols-2"><Panel title="风险参数"><div className="space-y-3">{[["总仓位上限", "maxTotalPositionPct"], ["单标的上限", "maxSinglePositionPct"], ["科技暴露上限", "maxTechnologyExposurePct"]].map(([label, key]) => <label key={key} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">{label}<input type="number" min="0" max="100" className={inputClass} value={state.settings[key as keyof typeof state.settings] as number} onChange={(e) => void setLimit(key as "maxTotalPositionPct" | "maxSinglePositionPct" | "maxTechnologyExposurePct", Number(e.target.value))} /></label>)}</div></Panel><Panel title="备份与恢复"><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={download}><Download className="h-4 w-4" />导出 JSON</button><label className={buttonClass}><Upload className="h-4 w-4" />恢复备份<input className="sr-only" type="file" accept=".json,application/json" onChange={(e) => void upload(e.target.files?.[0])} /></label></div>{legacyAvailable && <button className="mt-3 text-sm font-bold text-cyan-600" onClick={() => void migrateLegacy()}>检测到 V1 数据：创建快照并迁移</button>}<p role="status" className="mt-3 text-xs text-amber-700">{message}</p></Panel><Panel title="存储状态"><dl className="grid grid-cols-2 gap-3 text-sm"><dt>当前模式</dt><dd className="text-right font-bold">{state.mode}</dd><dt>本地数据库</dt><dd className="text-right font-bold text-emerald-600">IndexedDB</dd><dt>云同步</dt><dd className="text-right font-bold">{isSupabaseConfigured() ? "supabase_ready（已配置）" : state.settings.cloudSync}</dd><dt>数据版本</dt><dd className="text-right font-bold">Schema v{state.schemaVersion}</dd></dl></Panel><Panel title="演示与隐私"><p className="text-sm leading-6 text-slate-500">重置只会恢复匿名演示状态；公开仓库不包含真实持仓、账户名、截图或交易记录。</p><button className="mt-3 text-sm font-bold text-red-600" onClick={() => { if (window.confirm("确认用匿名演示数据覆盖当前浏览器数据？请先导出备份。")) void resetDemo(); }}>重置为匿名演示</button></Panel></div></>;
}
