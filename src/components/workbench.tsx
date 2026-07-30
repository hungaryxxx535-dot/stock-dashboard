"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Download, Loader2, Plus, RefreshCw, ShieldAlert, Upload } from "lucide-react";
import { usePortfolioData } from "@/components/data-provider";
import { calculatePortfolioMetrics, runStressTests } from "@/domain/engines/portfolio-risk-engine";
import type { AppState } from "@/domain/model";

type View = "home" | "portfolio" | "import" | "market" | "research" | "watchlist" | "plans" | "daily" | "risk" | "journal" | "settings";
const money = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
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
  const command = metrics.dataConfidence < 50 ? "等待数据：先补齐行情时间与来源，再评估操作。" : metrics.totalPositionPct > state.settings.maxTotalPositionPct ? "风险优先：总仓位超过设定上限，先复核减仓计划。" : "按计划观察：当前没有触发强制动作的风险规则。";
  return <><PageHeader title="今日作战台" description="先看数据质量，再看风险与计划。所有金额均为本机数据计算，公开部署只含匿名演示状态。" action={<Link className={buttonClass} href="/plans/daily">查看日程 <ArrowRight className="h-4 w-4" /></Link>} />
    {error && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
    <Panel className="mb-4 !border-slate-900 !bg-slate-950 !text-white dark:!border-cyan-400"><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">今日总指令</p><p className="mt-3 text-xl font-black">{command}</p><p className="mt-2 text-sm text-slate-300">数据置信度 {metrics.dataConfidence}% · 模式 {state.mode === "demo" ? "匿名演示" : "本地私有"}</p></Panel>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="总资产估算" value={money(metrics.totalAssets)} note="缺失行情时使用经济成本估算" /><Metric label="整体仓位" value={pct(metrics.totalPositionPct)} note={`上限 ${state.settings.maxTotalPositionPct}%`} /><Metric label="最大单仓" value={pct(metrics.largestHoldingPct)} note={`上限 ${state.settings.maxSinglePositionPct}%`} /><Metric label="科技暴露" value={pct(metrics.technologyExposurePct)} note={`上限 ${state.settings.maxTechnologyExposurePct}%`} /></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><Panel title="待处理"><ul className="space-y-3 text-sm">{metrics.dataConfidence < 100 && <li className="flex gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />行情不完整，价格相关结论必须降级。</li>}{state.tradePlans.filter((plan) => ["waiting", "actionable"].includes(plan.status)).map((plan) => <li key={plan.id} className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-cyan-600" />计划 {plan.direction} · {state.instruments.find((item) => item.id === plan.instrumentId)?.symbol ?? "未知标的"}</li>)}</ul></Panel><Panel title="数据边界"><p className="text-sm leading-7 text-slate-600 dark:text-slate-300">持仓、交易、复盘默认写入浏览器 IndexedDB。云同步未配置时不会上传；市场接口失败时保留来源、抓取时间和降级状态，不用静态价格冒充实时数据。</p></Panel></div>
  </>;
}

function PortfolioPage() {
  const { state, save } = usePortfolioData();
  const metrics = useMemo(() => calculatePortfolioMetrics(state), [state]);
  const [form, setForm] = useState({ symbol: "", name: "", quantity: "", cost: "", market: "CN" });
  const add = async (event: React.FormEvent) => {
    event.preventDefault(); const now = new Date().toISOString(); const instrumentId = id("instrument");
    await save((current) => ({ ...current, mode: "local", instruments: [...current.instruments, { id: instrumentId, symbol: form.symbol.toUpperCase(), name: form.name, market: form.market as "CN" | "US" | "HK", currency: form.market === "US" ? "USD" : form.market === "HK" ? "HKD" : "CNY", assetType: "stock", sectors: [], styles: [], isLeveraged: false }], holdings: [...current.holdings, { id: id("holding"), accountId: current.accounts.find((a) => a.market === form.market)?.id ?? current.accounts[0].id, instrumentId, quantity: Number(form.quantity), brokerCost: Number(form.cost), economicCost: Number(form.cost), status: "open", thesis: "", tags: [], openedAt: now, closedAt: null, updatedAt: now }] }));
    setForm({ symbol: "", name: "", quantity: "", cost: "", market: "CN" });
  };
  const remove = async (holdingId: string) => save((current) => ({ ...current, holdings: current.holdings.map((item) => item.id === holdingId ? { ...item, status: "closed", closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item) }));
  return <><PageHeader title="持仓中心" description="统一管理账户、现金、持仓与交易。删除操作采用软关闭，历史数据仍可审计。" action={<Link className={buttonClass} href="/portfolio/import"><Upload className="h-4 w-4" />导入</Link>} />
    <div className="mb-4 grid gap-4 sm:grid-cols-3"><Metric label="投资市值" value={money(metrics.investedValue)} /><Metric label="现金" value={money(metrics.cashValue)} /><Metric label="开放持仓" value={`${metrics.valuations.length} 项`} /></div>
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]"><Panel title="持仓明细"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">标的</th><th>市场</th><th>数量</th><th>券商成本</th><th>经济成本</th><th>估算市值</th><th></th></tr></thead><tbody>{metrics.valuations.map((item) => <tr key={item.holding.id} className="border-t"><td className="py-3 font-bold">{item.instrument.symbol}<span className="block font-normal text-slate-500">{item.instrument.name}</span></td><td>{item.instrument.market}</td><td>{item.holding.quantity}</td><td>{item.holding.brokerCost}</td><td>{item.holding.economicCost}</td><td>{money(item.valueBase)}{item.estimated && <span className="block text-xs text-amber-600">成本估算</span>}</td><td><button className="text-red-600" onClick={() => remove(item.holding.id)}>关闭</button></td></tr>)}</tbody></table></div></Panel>
    <Panel title="手工新增持仓"><form onSubmit={add} className="grid gap-3"><input required aria-label="证券代码" placeholder="证券代码" className={inputClass} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} /><input required aria-label="证券名称" placeholder="证券名称" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><select aria-label="市场" className={inputClass} value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })}><option value="CN">A 股</option><option value="HK">港股</option><option value="US">美股</option></select><input required min="0" step="any" type="number" placeholder="数量" className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /><input required min="0" step="any" type="number" placeholder="成本" className={inputClass} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /><button className={buttonClass}><Plus className="h-4 w-4" />保存到本机</button></form></Panel></div>
  </>;
}

function ImportPage() {
  const { importBackup, state } = usePortfolioData();
  const [raw, setRaw] = useState(""); const [message, setMessage] = useState("");
  const run = async () => { try { await importBackup(raw); setMessage("校验通过并已导入；导入前状态已自动快照。"); } catch { setMessage("导入失败：文件结构或校验不通过，原数据未改变。"); } };
  return <><PageHeader title="导入中心" description="支持 V2 JSON 备份；CSV、券商截图与 OCR 必须经过解析、差异预览和人工确认后才能保存。" />
    <div className="grid gap-4 lg:grid-cols-3"><Panel title="1. 选择来源"><div className="space-y-2 text-sm"><p className="rounded-xl bg-cyan-50 p-3 text-cyan-900">V2 JSON：可直接严格校验</p><p className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">CSV：字段映射后确认</p><p className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">截图 OCR：仅本地解析，失败不落库</p></div></Panel><Panel title="2. 校验与差异"><textarea aria-label="粘贴 V2 JSON" className={`${inputClass} min-h-48 py-3 font-mono`} placeholder="粘贴导出的 V2 JSON…" value={raw} onChange={(e) => setRaw(e.target.value)} /><p className="mt-2 text-xs text-slate-500">当前版本：{state.dataVersions.at(-1)?.label}</p></Panel><Panel title="3. 人工确认"><button disabled={!raw} onClick={run} className={buttonClass}><Upload className="h-4 w-4" />确认导入</button>{message && <p role="status" className="mt-3 text-sm">{message}</p>}<p className="mt-4 text-xs leading-6 text-slate-500">OCR 置信度不足、字段缺失或总额不闭合时不会写入。每次导入前自动创建可恢复快照。</p></Panel></div>
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
  const stages = [["08:30", "盘前", "检查隔夜市场、数据源与计划有效期"], ["09:25", "开盘", "只执行已满足条件的计划"], ["11:30", "午间", "记录偏离，不追逐未经计划的波动"], ["15:10", "收盘", "核对持仓与风险变化"], ["21:30", "美股", "检查美元暴露和跨市场相关性"], ["23:59", "归档", "创建日终快照并复盘流程质量"]];
  return <><PageHeader title="每日作战流程" description="定时任务未配置密钥时保持手工模式；页面不会因此失效。" /><Panel><ol className="space-y-4">{stages.map(([time, title, detail]) => <li key={time} className="grid grid-cols-[4rem_1fr] gap-3"><time className="font-black text-cyan-600">{time}</time><div className="border-l-2 border-cyan-200 pl-4"><b>{title}</b><p className="text-sm text-slate-500">{detail}</p></div></li>)}</ol></Panel></>;
}
function RiskPage() {
  const { state } = usePortfolioData(); const metrics = useMemo(() => calculatePortfolioMetrics(state), [state]); const stress = useMemo(() => runStressTests(state, metrics), [state, metrics]);
  const warnings = [{ name: "总仓位", value: metrics.totalPositionPct, max: state.settings.maxTotalPositionPct }, { name: "最大单仓", value: metrics.largestHoldingPct, max: state.settings.maxSinglePositionPct }, { name: "科技暴露", value: metrics.technologyExposurePct, max: state.settings.maxTechnologyExposurePct }];
  return <><PageHeader title="风险中心" description="集中度、相关性、汇率和压力测试均基于统一组合口径；缺失行情时明确标注估算。" /><div className="mb-4 grid gap-4 sm:grid-cols-3">{warnings.map((item) => <Panel key={item.name}><div className="flex justify-between"><b>{item.name}</b>{item.value > item.max ? <ShieldAlert className="text-red-600" /> : <CheckCircle2 className="text-emerald-600" />}</div><p className="mt-3 text-2xl font-black">{pct(item.value)}</p><p className="text-xs text-slate-500">规则上限 {item.max}%</p></Panel>)}</div><Panel title="压力测试"><div className="grid gap-3 lg:grid-cols-2">{stress.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><b>{item.name}</b><span className={item.severity === "high" ? "text-red-600" : "text-amber-600"}>{pct(item.impactPct)}</span></div><p className="text-sm text-slate-500">{money(item.impactAmount)} · {item.assumptions.join("；")}</p></div>)}</div></Panel></>;
}
function JournalPage() {
  const { state, save } = usePortfolioData(); const [note, setNote] = useState("");
  const add = () => { const instrument = state.instruments[0]; if (!instrument || !note.trim()) return; void save((current) => ({ ...current, journalEntries: [...current.journalEntries, { id: id("journal"), instrumentId: instrument.id, planId: null, originalThesis: note, plannedAction: "观察", actualAction: "观察", executedAt: new Date().toISOString(), price: 0, quantity: 0, pnl: 0, followedPlan: true, processQuality: "correct", resultQuality: "flat", strengths: ["记录及时"], mistakes: [], emotion: "平静", lessons: [], nextRules: [], attachmentRefs: [] }] })); setNote(""); };
  return <><PageHeader title="复盘日志" description="分开记录过程质量和结果质量，避免只以盈亏评价决策。" /><div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]"><Panel title="快速记录"><textarea className={`${inputClass} min-h-32 py-3`} placeholder="原始判断、执行偏差或新规则…" value={note} onChange={(e) => setNote(e.target.value)} /><button className={`${buttonClass} mt-3`} onClick={add}>保存复盘</button></Panel><Panel title="历史记录"><div className="space-y-3">{state.journalEntries.length ? state.journalEntries.map((entry) => <article key={entry.id} className="rounded-xl border p-3"><div className="flex justify-between"><b>{state.instruments.find((item) => item.id === entry.instrumentId)?.symbol}</b><time className="text-xs text-slate-500">{new Date(entry.executedAt).toLocaleString("zh-CN")}</time></div><p className="mt-2 text-sm">{entry.originalThesis}</p><p className="mt-2 text-xs text-slate-500">过程：{entry.processQuality} · 结果：{entry.resultQuality}</p></article>) : <p className="text-sm text-slate-500">还没有复盘记录。</p>}</div></Panel></div></>;
}
function SettingsPage() {
  const { state, save, exportBackup, importBackup, legacyAvailable, migrateLegacy, resetDemo } = usePortfolioData(); const [message, setMessage] = useState("");
  const download = async () => { const raw = await exportBackup(); const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `stock-war-room-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage("加密边界提示：备份包含私有数据，请自行安全保管。"); };
  const upload = async (file?: File) => { if (!file) return; try { await importBackup(await file.text()); setMessage("备份已校验并恢复。"); } catch { setMessage("恢复失败，原数据未改变。"); } };
  const setLimit = (key: "maxTotalPositionPct" | "maxSinglePositionPct" | "maxTechnologyExposurePct", value: number) => save((current) => ({ ...current, settings: { ...current.settings, [key]: value, updatedAt: new Date().toISOString() } }));
  return <><PageHeader title="设置与数据安全" description="真实持仓默认只存本机。云同步仅提供适配器，未配置 Supabase 时保持关闭。" /><div className="grid gap-4 lg:grid-cols-2"><Panel title="风险参数"><div className="space-y-3">{[["总仓位上限", "maxTotalPositionPct"], ["单标的上限", "maxSinglePositionPct"], ["科技暴露上限", "maxTechnologyExposurePct"]].map(([label, key]) => <label key={key} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">{label}<input type="number" min="0" max="100" className={inputClass} value={state.settings[key as keyof typeof state.settings] as number} onChange={(e) => void setLimit(key as "maxTotalPositionPct" | "maxSinglePositionPct" | "maxTechnologyExposurePct", Number(e.target.value))} /></label>)}</div></Panel><Panel title="备份与恢复"><div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={download}><Download className="h-4 w-4" />导出 JSON</button><label className={buttonClass}><Upload className="h-4 w-4" />恢复备份<input className="sr-only" type="file" accept=".json,application/json" onChange={(e) => void upload(e.target.files?.[0])} /></label></div>{legacyAvailable && <button className="mt-3 text-sm font-bold text-cyan-600" onClick={() => void migrateLegacy()}>检测到 V1 数据：创建快照并迁移</button>}<p role="status" className="mt-3 text-xs text-amber-700">{message}</p></Panel><Panel title="存储状态"><dl className="grid grid-cols-2 gap-3 text-sm"><dt>当前模式</dt><dd className="text-right font-bold">{state.mode}</dd><dt>本地数据库</dt><dd className="text-right font-bold text-emerald-600">IndexedDB</dd><dt>云同步</dt><dd className="text-right font-bold">{state.settings.cloudSync}</dd><dt>数据版本</dt><dd className="text-right font-bold">Schema v{state.schemaVersion}</dd></dl></Panel><Panel title="演示与隐私"><p className="text-sm leading-6 text-slate-500">重置只会恢复匿名演示状态；公开仓库不包含真实持仓、账户名、截图或交易记录。</p><button className="mt-3 text-sm font-bold text-red-600" onClick={() => { if (window.confirm("确认用匿名演示数据覆盖当前浏览器数据？请先导出备份。")) void resetDemo(); }}>重置为匿名演示</button></Panel></div></>;
}
