"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, DatabaseZap, Gauge, ShieldAlert, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aShareHoldings, accountSnapshot, dataVersion, usHoldings } from "@/data/portfolio";

type SessionMode = "pre" | "intraday" | "close";
type MarketMode = "strong" | "flat" | "down";
type DeskMode = "a-share" | "us";
type BadgeTone = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

type TradePlan = {
  lqTechTrailingStop: number;
  kcChipWatchPrice: number;
  amdTrailingStop: number;
  anetStopLoss: number;
  cashTargetPct: number;
};

type NoteState = {
  observation: string;
  decision: string;
};

type ChecklistState = {
  aShareScreenshot: boolean;
  usScreenshot: boolean;
  portfolioUpdated: boolean;
  vercelChecked: boolean;
  dataVersionChecked: boolean;
};

type SavedState = {
  sessionMode?: SessionMode;
  marketMode?: MarketMode;
  deskMode?: DeskMode;
  tradePlan?: TradePlan;
  note?: NoteState;
  checklist?: ChecklistState;
};

const STORAGE_KEY = "fei-trade-plan-v3";

const defaultPlan: TradePlan = {
  lqTechTrailingStop: 185,
  kcChipWatchPrice: 2.05,
  amdTrailingStop: 380,
  anetStopLoss: 150,
  cashTargetPct: 20,
};

const defaultChecklist: ChecklistState = {
  aShareScreenshot: false,
  usScreenshot: false,
  portfolioUpdated: false,
  vercelChecked: false,
  dataVersionChecked: false,
};

const sessionOptions = [
  { id: "pre" as const, title: "盘前", badge: "定计划", desc: "先校验数据，再确认今天能不能动手。" },
  { id: "intraday" as const, title: "盘中", badge: "看触发", desc: "只看触发条件，不临时上头。" },
  { id: "close" as const, title: "收盘后", badge: "做复盘", desc: "记录执行结果，更新截图和明日预案。" },
];

const marketOptions = [
  { id: "strong" as const, title: "强势上冲", badge: "不追高" },
  { id: "flat" as const, title: "正常震荡", badge: "等触发" },
  { id: "down" as const, title: "放量回撤", badge: "先风控" },
];

const deskOptions = [
  { id: "a-share" as const, title: "A股执行台", desc: "科创 / 半导体 / 防守仓" },
  { id: "us" as const, title: "美股执行台", desc: "META / AMD / ANET / 中概" },
];

const formatPct = (value: number) => `${value.toFixed(1)}%`;
const formatCny = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const formatUsd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const formatAmount = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const extractDate = (text: string) => text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";

function getChinaDateString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export default function TradePlanV2Page() {
  const [sessionMode, setSessionMode] = useState<SessionMode>("intraday");
  const [marketMode, setMarketMode] = useState<MarketMode>("flat");
  const [deskMode, setDeskMode] = useState<DeskMode>("a-share");
  const [tradePlan, setTradePlan] = useState<TradePlan>(defaultPlan);
  const [note, setNote] = useState<NoteState>({ observation: "", decision: "" });
  const [checklist, setChecklist] = useState<ChecklistState>(defaultChecklist);
  const [storageReady, setStorageReady] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(getChinaDateString());
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedState;
        if (saved.sessionMode) setSessionMode(saved.sessionMode);
        if (saved.marketMode) setMarketMode(saved.marketMode);
        if (saved.deskMode) setDeskMode(saved.deskMode);
        if (saved.tradePlan) setTradePlan({ ...defaultPlan, ...saved.tradePlan });
        if (saved.note) setNote({ observation: saved.note.observation ?? "", decision: saved.note.decision ?? "" });
        if (saved.checklist) setChecklist({ ...defaultChecklist, ...saved.checklist });
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const payload: SavedState = { sessionMode, marketMode, deskMode, tradePlan, note, checklist };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [storageReady, sessionMode, marketMode, deskMode, tradePlan, note, checklist]);

  const lq = aShareHoldings.find((item) => item.code === "688008");
  const kcChip = aShareHoldings.find((item) => item.code === "588750");
  const amd = usHoldings.find((item) => item.code === "AMD");
  const anet = usHoldings.find((item) => item.code === "ANET");

  const aShareDate = extractDate(dataVersion.aShare);
  const usDate = extractDate(dataVersion.us);
  const aShareStale = Boolean(today && aShareDate && aShareDate !== today);
  const usStale = Boolean(today && usDate && usDate !== today);
  const hasStaleData = aShareStale || usStale;

  const cashTargetAmount = accountSnapshot.aShare.totalAssets * (tradePlan.cashTargetPct / 100);
  const cashGap = Math.max(0, cashTargetAmount - accountSnapshot.aShare.availableCash);
  const accountCashPct = (accountSnapshot.aShare.availableCash / accountSnapshot.aShare.totalAssets) * 100;
  const checklistDone = Object.values(checklist).filter(Boolean).length;

  const techCoreNames = new Set(["科创芯50", "澜起科技", "通信ETF", "科创半导", "科创200", "胜宏科技", "AI创业板"]);
  const techCoreValue = aShareHoldings.filter((item) => techCoreNames.has(item.name)).reduce((sum, item) => sum + item.marketValue, 0);
  const techCorePct = accountSnapshot.aShare.marketValue === 0 ? 0 : (techCoreValue / accountSnapshot.aShare.marketValue) * 100;

  const sessionCopy = {
    pre: {
      title: "盘前模式：先确认数据，再确认今天能不能动手",
      desc: "盘前不做交易冲动，只做三件事：数据是否更新、风险灯是否过热、操作线是否合理。",
      tasks: ["先看数据过期提醒，旧数据不要当今日决策依据。", "确认 A股 / 美股今天分别看哪几个核心标的。", "只调整操作线，不提前幻想盘中机会。"],
    },
    intraday: {
      title: "盘中模式：只看触发，不做临时幻想",
      desc: "盘中先选状态，再看执行台和优先级。没有触发操作线，就不为了操作而操作。",
      tasks: ["先选强势、震荡、回撤三档状态。", "按执行优先级看 ANET、澜起、AMD、科创系。", "写清楚观察和动作，写不清楚就先不动。"],
    },
    close: {
      title: "收盘后模式：先复盘，再更新数据",
      desc: "收盘后重点不是下判断，而是记录有没有执行纪律，并把截图更新清单走完。",
      tasks: ["填写盘中记录卡，保存今天真实想法。", "检查截图更新入口 5 项是否完成。", "把今天的错误和明天的预案写成一句话。"],
    },
  }[sessionMode];

  const marketCopy = {
    strong: "强势上冲：只上移止盈线，不追高买入。",
    flat: "正常震荡：等待触发，不为了操作而操作。",
    down: "放量回撤：先处理风险，再考虑机会。",
  }[marketMode];

  const riskLights = [
    {
      title: "仓位灯",
      status: accountSnapshot.aShare.brokerPositionPct >= 90 ? "红灯" : "黄灯",
      variant: accountSnapshot.aShare.brokerPositionPct >= 90 ? "destructive" : "warning",
      note: `券商账户仓位 ${formatPct(accountSnapshot.aShare.brokerPositionPct)}。`,
    },
    {
      title: "现金灯",
      status: accountCashPct < tradePlan.cashTargetPct ? "黄灯" : "绿灯",
      variant: accountCashPct < tradePlan.cashTargetPct ? "warning" : "success",
      note: `账户内现金 ${formatPct(accountCashPct)}，目标 ${formatPct(tradePlan.cashTargetPct)}。`,
    },
    {
      title: "集中度灯",
      status: techCorePct >= 65 ? "红灯" : "黄灯",
      variant: techCorePct >= 65 ? "destructive" : "warning",
      note: `科创/科技核心约占 A股市值 ${formatPct(techCorePct)}。`,
    },
    {
      title: "数据灯",
      status: hasStaleData ? "红灯" : "绿灯",
      variant: hasStaleData ? "destructive" : "success",
      note: hasStaleData ? "数据不是今天，先更新。" : "数据日期与今天一致。",
    },
  ] satisfies { title: string; status: string; variant: BadgeTone; note: string }[];

  const aShareDesk = [
    { name: "科创芯50", code: "588750", price: kcChip?.currentPrice ?? 0, value: kcChip?.marketValue ?? 0, pnl: kcChip?.pnl ?? 0, action: `观察 ${formatCny(tradePlan.kcChipWatchPrice)} 附近承接；冲高不追。`, unit: "cny" as const },
    { name: "澜起科技", code: "688008", price: lq?.currentPrice ?? 0, value: lq?.marketValue ?? 0, pnl: lq?.pnl ?? 0, action: `跌破 ${formatCny(tradePlan.lqTechTrailingStop)} 触发锁盈复核。`, unit: "cny" as const },
    { name: "招商银行", code: "600036", price: aShareHoldings.find((item) => item.code === "600036")?.currentPrice ?? 0, value: aShareHoldings.find((item) => item.code === "600036")?.marketValue ?? 0, pnl: aShareHoldings.find((item) => item.code === "600036")?.pnl ?? 0, action: "防守仓，不因为科技回撤就乱砍。", unit: "cny" as const },
  ];

  const usDesk = [
    { name: "META", code: "Meta Platforms", price: usHoldings.find((item) => item.code === "META")?.currentPrice ?? 0, value: usHoldings.find((item) => item.code === "META")?.marketValue ?? 0, pnl: usHoldings.find((item) => item.code === "META")?.pnl ?? 0, action: "美股第一大仓，先看是否稳住核心锚。", unit: "usd" as const },
    { name: "AMD", code: "美国超微公司", price: amd?.currentPrice ?? 0, value: amd?.marketValue ?? 0, pnl: amd?.pnl ?? 0, action: `跌破 ${formatUsd(tradePlan.amdTrailingStop)} 触发移动止盈复核。`, unit: "usd" as const },
    { name: "ANET", code: "Arista Networks", price: anet?.currentPrice ?? 0, value: anet?.marketValue ?? 0, pnl: anet?.pnl ?? 0, action: `跌破 ${formatUsd(tradePlan.anetStopLoss)} 优先风控，不补跌。`, unit: "usd" as const },
  ];

  const activeDesk = deskMode === "a-share" ? aShareDesk : usDesk;

  const checklistItems: { key: keyof ChecklistState; label: string; desc: string }[] = [
    { key: "aShareScreenshot", label: "A股截图已上传", desc: dataVersion.aShare },
    { key: "usScreenshot", label: "美股截图已上传", desc: dataVersion.us },
    { key: "portfolioUpdated", label: "portfolio.ts 已更新", desc: "持仓、数量、成本、现价、盈亏检查完成" },
    { key: "vercelChecked", label: "Vercel 已部署", desc: "线上页面已刷新看到新数据" },
    { key: "dataVersionChecked", label: "数据版本已核对", desc: "页面口径与今日截图一致" },
  ];

  const noteTemplate = `阶段：${sessionOptions.find((item) => item.id === sessionMode)?.title}\n盘面：${marketOptions.find((item) => item.id === marketMode)?.title}\n执行台：${deskMode === "a-share" ? "A股" : "美股"}\n数据状态：${hasStaleData ? "已过期，先更新" : "未过期"}\n现金缺口：${formatAmount(cashGap)}\n观察：${note.observation || "未填写"}\n决定：${note.decision || "未填写"}`;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">三段式股票执行台</h1>
              <Badge variant="warning">V2</Badge>
              <Badge variant={storageReady ? "success" : "outline"}>{storageReady ? "已本地保存" : "保存中"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">盘前 / 盘中 / 收盘后 · 数据过期提醒 · A股/美股分区</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm"><ArrowLeft className="mr-1 h-4 w-4" />返回</a>
        </header>

        <Card className={hasStaleData ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />数据状态提醒</CardTitle>
            <CardDescription>{hasStaleData ? "数据日期不是今天，今日交易前先更新截图和持仓数据。" : "数据日期与今天一致，但仍不是实时行情。"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p><span className="font-bold">今天：</span>{today || "读取中"}</p>
            <p><span className="font-bold">A股数据：</span>{dataVersion.aShare}</p>
            <p><span className="font-bold">美股数据：</span>{dataVersion.us}</p>
            <p className="font-black">{hasStaleData ? "结论：数据过期，不要按旧持仓直接做今日买卖决定。" : "结论：数据未过期，但下单前仍需看实时盘面。"}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />盘前 / 盘中 / 收盘后三段模式</CardTitle>
            <CardDescription className="text-slate-300">一天打开三次，每次只看当前阶段该看的东西。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {sessionOptions.map((item) => {
                const selected = sessionMode === item.id;
                return <button key={item.id} onClick={() => setSessionMode(item.id)} className={`rounded-2xl border p-3 text-left ${selected ? "border-white bg-white text-slate-950" : "border-white/20 bg-white/10 text-white"}`}><p className="font-black">{item.title}</p><p className={`mt-1 text-xs ${selected ? "text-slate-500" : "text-white/60"}`}>{item.badge}</p></button>;
              })}
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="font-black">{sessionCopy.title}</p>
              <p className="mt-2 text-sm text-white/70">{sessionCopy.desc}</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-100">{sessionCopy.tasks.map((item, index) => <p key={item}>{index + 1}. {item}</p>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>多风险灯</CardTitle><CardDescription>仓位、现金、集中度、数据过期分开看。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {riskLights.map((item) => <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="font-black">{item.title}</p><Badge variant={item.variant}>{item.status}</Badge></div><p className="mt-2 text-sm text-slate-600">{item.note}</p></div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />当前盘面状态</CardTitle><CardDescription>{marketCopy}</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            {marketOptions.map((item) => <button key={item.id} onClick={() => setMarketMode(item.id)} className={`rounded-2xl border p-3 text-left ${marketMode === item.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}><p className="text-sm font-black">{item.title}</p><p className="mt-1 text-xs opacity-70">{item.badge}</p></button>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>A股 / 美股分开执行台</CardTitle><CardDescription>{deskMode === "a-share" ? "A股先看科创芯50、澜起和招商银行。" : "美股先看 META、AMD、ANET。"}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">{deskOptions.map((item) => <button key={item.id} onClick={() => setDeskMode(item.id)} className={`rounded-2xl border p-3 text-left ${deskMode === item.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}><p className="font-black">{item.title}</p><p className="mt-1 text-xs opacity-70">{item.desc}</p></button>)}</div>
            <div className="grid gap-3">{activeDesk.map((item) => <ExecutionCard key={item.name} item={item} />)}</div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <TradeInput label="澜起科技移动止盈线" prefix="¥" value={tradePlan.lqTechTrailingStop} onChange={(value) => setTradePlan({ ...tradePlan, lqTechTrailingStop: value })} />
          <TradeInput label="科创芯50观察位" prefix="¥" value={tradePlan.kcChipWatchPrice} step="0.001" onChange={(value) => setTradePlan({ ...tradePlan, kcChipWatchPrice: value })} />
          <TradeInput label="AMD 移动止盈线" prefix="$" value={tradePlan.amdTrailingStop} onChange={(value) => setTradePlan({ ...tradePlan, amdTrailingStop: value })} />
          <TradeInput label="ANET 止损线" prefix="$" value={tradePlan.anetStopLoss} onChange={(value) => setTradePlan({ ...tradePlan, anetStopLoss: value })} />
          <TradeInput label="目标现金比例" suffix="%" value={tradePlan.cashTargetPct} onChange={(value) => setTradePlan({ ...tradePlan, cashTargetPct: value })} />
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />现金目标测算</CardTitle><CardDescription>场外现金单独保留，账户内仓位仍要控制。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <MiniMetric label="券商账户仓位" value={formatPct(accountSnapshot.aShare.brokerPositionPct)} />
            <MiniMetric label="账户内现金比例" value={formatPct(accountCashPct)} />
            <MiniMetric label="目标现金金额" value={formatAmount(cashTargetAmount)} />
            <MiniMetric label="还需释放现金" value={formatAmount(cashGap)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>截图更新入口</CardTitle><CardDescription>完成 {checklistDone}/5。这个清单会本地保存。</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {checklistItems.map((item) => <label key={item.key} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><input type="checkbox" checked={checklist[item.key]} onChange={(event) => setChecklist({ ...checklist, [item.key]: event.target.checked })} className="mt-1 h-4 w-4 shrink-0" /><span><span className="block font-black text-slate-900">{item.label}</span><span className="block text-xs text-slate-500">{item.desc}</span></span></label>)}
          </CardContent>
        </Card>

        <Card className="border-red-100 bg-red-50/70">
          <CardHeader><CardTitle>今日禁止动作</CardTitle><CardDescription>这部分专门用来管住手。</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="rounded-2xl bg-white/70 p-3 font-medium text-red-800">数据过期时，不按旧持仓做今日买卖决定。</div>
            <div className="rounded-2xl bg-white/70 p-3 font-medium text-red-800">科创和半导体高集中时，不继续叠同方向仓位。</div>
            <div className="rounded-2xl bg-white/70 p-3 font-medium text-red-800">ANET 如果继续弱，不补仓摊低成本。</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>盘中记录卡</CardTitle><CardDescription>先写观察，再写决定。写不清楚，就先不动；内容会本地保存。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <label className="grid gap-2 font-medium">我现在看到的盘面<textarea className="min-h-24 rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400" value={note.observation} onChange={(event) => setNote({ ...note, observation: event.target.value })} /></label>
            <label className="grid gap-2 font-medium">我准备执行的动作<textarea className="min-h-24 rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400" value={note.decision} onChange={(event) => setNote({ ...note, decision: event.target.value })} /></label>
            <div className="whitespace-pre-line rounded-2xl bg-slate-50 p-3 font-medium text-slate-700">{noteTemplate}</div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ExecutionCard({ item }: { item: { name: string; code: string; price: number; value: number; pnl: number; action: string; unit: "cny" | "usd" } }) {
  const positive = item.pnl >= 0;
  const price = item.unit === "cny" ? formatCny(item.price) : formatUsd(item.price);
  const value = item.unit === "cny" ? formatAmount(item.value) : formatUsd(item.value);
  const pnl = item.unit === "cny" ? formatAmount(item.pnl) : formatUsd(item.pnl);
  return <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.name}</p><p className="text-xs text-slate-500">{item.code}</p></div><Badge variant={positive ? "success" : "warning"}>{positive ? "浮盈" : "浮亏"}</Badge></div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><MiniMetric label="静态现价" value={price} /><MiniMetric label="市值" value={value} /><MiniMetric label="盈亏" value={pnl} /></div><p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">执行口径：{item.action}</p></div>;
}

function TradeInput({ label, value, onChange, prefix, suffix, step = "0.01" }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; step?: string }) {
  return <Card><CardContent className="p-4"><label className="grid gap-2 text-sm font-medium">{label}<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">{prefix && <span className="text-sm font-bold text-slate-500">{prefix}</span>}<Input className="border-none p-0 shadow-none focus-visible:ring-0" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <span className="text-sm font-bold text-slate-500">{suffix}</span>}</div></label></CardContent></Card>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>;
}
