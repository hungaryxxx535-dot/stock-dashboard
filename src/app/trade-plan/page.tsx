"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gauge, ShieldAlert, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aShareHoldings, accountSnapshot, dataVersion, usHoldings } from "@/data/portfolio";

type TradePlan = {
  lqTechTrailingStop: number;
  kcChipWatchPrice: number;
  amdTrailingStop: number;
  anetStopLoss: number;
  cashTargetPct: number;
};

type MarketMode = "strong" | "flat" | "down";
type DeskMode = "a-share" | "us";

type IntradayNote = {
  observation: string;
  decision: string;
};

type UpdateChecklist = {
  aShareScreenshot: boolean;
  usScreenshot: boolean;
  portfolioUpdated: boolean;
  vercelChecked: boolean;
  dataVersionChecked: boolean;
};

type SavedState = {
  tradePlan?: TradePlan;
  marketMode?: MarketMode;
  activeDesk?: DeskMode;
  intradayNote?: IntradayNote;
  updateChecklist?: UpdateChecklist;
};

type ExecutionItem = {
  name: string;
  code: string;
  current: number;
  marketValue: number;
  pnl: number;
  type: string;
  action: string;
  unit: "cny" | "usd";
};

type BadgeTone = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const STORAGE_KEY = "fei-trade-plan-v2";

const defaultTradePlan: TradePlan = {
  lqTechTrailingStop: 185,
  kcChipWatchPrice: 2.05,
  amdTrailingStop: 380,
  anetStopLoss: 150,
  cashTargetPct: 20,
};

const defaultChecklist: UpdateChecklist = {
  aShareScreenshot: false,
  usScreenshot: false,
  portfolioUpdated: false,
  vercelChecked: false,
  dataVersionChecked: false,
};

const modeOptions: { id: MarketMode; title: string; badge: string; tone: string }[] = [
  { id: "strong", title: "强势上冲", badge: "不追高", tone: "bg-red-50 border-red-100" },
  { id: "flat", title: "正常震荡", badge: "等触发", tone: "bg-white border-slate-200" },
  { id: "down", title: "放量回撤", badge: "先风控", tone: "bg-amber-50 border-amber-100" },
];

const deskOptions: { id: DeskMode; title: string; desc: string }[] = [
  { id: "a-share", title: "A股执行台", desc: "科创 / 半导体 / 防守仓" },
  { id: "us", title: "美股执行台", desc: "META / AMD / ANET / 中概" },
];

const findAShare = (code: string) => aShareHoldings.find((item) => item.code === code);
const findUs = (code: string) => usHoldings.find((item) => item.code === code);

const formatPct = (value: number) => `${value.toFixed(1)}%`;
const formatCny = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const formatUsd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const formatAmount = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const isExecutionItem = (item: ExecutionItem | null): item is ExecutionItem => item !== null;

export default function TradePlanPage() {
  const [tradePlan, setTradePlan] = useState<TradePlan>(defaultTradePlan);
  const [marketMode, setMarketMode] = useState<MarketMode>("flat");
  const [activeDesk, setActiveDesk] = useState<DeskMode>("a-share");
  const [intradayNote, setIntradayNote] = useState<IntradayNote>({ observation: "", decision: "" });
  const [updateChecklist, setUpdateChecklist] = useState<UpdateChecklist>(defaultChecklist);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedState;
        if (saved.tradePlan) setTradePlan({ ...defaultTradePlan, ...saved.tradePlan });
        if (saved.marketMode) setMarketMode(saved.marketMode);
        if (saved.activeDesk) setActiveDesk(saved.activeDesk);
        if (saved.intradayNote) setIntradayNote({ observation: saved.intradayNote.observation ?? "", decision: saved.intradayNote.decision ?? "" });
        if (saved.updateChecklist) setUpdateChecklist({ ...defaultChecklist, ...saved.updateChecklist });
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const payload: SavedState = { tradePlan, marketMode, activeDesk, intradayNote, updateChecklist };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [storageReady, tradePlan, marketMode, activeDesk, intradayNote, updateChecklist]);

  const lq = findAShare("688008");
  const kcChip = findAShare("588750");
  const amd = findUs("AMD");
  const anet = findUs("ANET");

  const cashTargetAmount = accountSnapshot.aShare.totalAssets * (tradePlan.cashTargetPct / 100);
  const cashGap = Math.max(0, cashTargetAmount - accountSnapshot.aShare.availableCash);
  const currentAccountCashPct = (accountSnapshot.aShare.availableCash / accountSnapshot.aShare.totalAssets) * 100;
  const releasePct = accountSnapshot.aShare.totalAssets === 0 ? 0 : (cashGap / accountSnapshot.aShare.totalAssets) * 100;
  const checklistDone = Object.values(updateChecklist).filter(Boolean).length;

  const techCoreNames = new Set(["科创芯50", "澜起科技", "通信ETF", "科创半导", "科创200", "胜宏科技", "AI创业板"]);
  const techCoreValue = aShareHoldings.filter((item) => techCoreNames.has(item.name)).reduce((sum, item) => sum + item.marketValue, 0);
  const techCorePct = accountSnapshot.aShare.marketValue === 0 ? 0 : (techCoreValue / accountSnapshot.aShare.marketValue) * 100;

  const activeModeCopy = {
    strong: {
      title: "主动作：只上移止盈线，不追高买入",
      text: "如果盘面继续强，优先保护已有利润。科创芯50、澜起、AMD 这类高弹性仓只看是否锁一点，不做新增。",
      order: "可做：上移止盈线 / 小幅锁盈。禁止：追涨加仓同方向。",
    },
    flat: {
      title: "主动作：等待触发，不为了操作而操作",
      text: "震荡日最容易乱动。只要没有跌破操作线，也没有明显放量转弱，就继续观察。",
      order: "可做：更新预案 / 看承接。禁止：反复短线换仓。",
    },
    down: {
      title: "主动作：先处理风险，再考虑机会",
      text: "放量回撤时，先看 ANET 是否触发止损，再看澜起和 AMD 是否跌破移动止盈线，最后再看科创系是否需要合并降集中度。",
      order: "可做：减弱仓 / 锁利润 / 降集中度。禁止：越跌越补。",
    },
  }[marketMode];

  const riskLights = [
    {
      title: "仓位灯",
      status: accountSnapshot.aShare.brokerPositionPct >= 90 ? "红灯" : accountSnapshot.aShare.brokerPositionPct >= 80 ? "黄灯" : "绿灯",
      variant: accountSnapshot.aShare.brokerPositionPct >= 90 ? "destructive" : accountSnapshot.aShare.brokerPositionPct >= 80 ? "warning" : "success",
      note: `券商账户仓位 ${formatPct(accountSnapshot.aShare.brokerPositionPct)}，账户内已经很满。`,
    },
    {
      title: "现金灯",
      status: currentAccountCashPct < tradePlan.cashTargetPct ? "黄灯" : "绿灯",
      variant: currentAccountCashPct < tradePlan.cashTargetPct ? "warning" : "success",
      note: `账户内现金 ${formatPct(currentAccountCashPct)}，目标 ${formatPct(tradePlan.cashTargetPct)}。`,
    },
    {
      title: "集中度灯",
      status: techCorePct >= 65 ? "红灯" : techCorePct >= 55 ? "黄灯" : "绿灯",
      variant: techCorePct >= 65 ? "destructive" : techCorePct >= 55 ? "warning" : "success",
      note: `科创/科技核心约占 A股市值 ${formatPct(techCorePct)}。`,
    },
    {
      title: "新仓风险灯",
      status: (anet?.pnl ?? 0) < 0 ? "黄灯" : "绿灯",
      variant: (anet?.pnl ?? 0) < 0 ? "warning" : "success",
      note: `ANET 当前静态盈亏 ${formatUsd(anet?.pnl ?? 0)}，不补跌。`,
    },
    {
      title: "浮盈保护灯",
      status: (lq?.pnl ?? 0) > 50000 || (amd?.pnl ?? 0) > 1000 ? "黄灯" : "绿灯",
      variant: (lq?.pnl ?? 0) > 50000 || (amd?.pnl ?? 0) > 1000 ? "warning" : "success",
      note: "澜起和 AMD 浮盈较大，优先用移动止盈保护。",
    },
  ] satisfies { title: string; status: string; variant: BadgeTone; note: string }[];

  const buildAShareExecution = (code: string, action: string): ExecutionItem | null => {
    const item = findAShare(code);
    if (!item) return null;
    return { name: item.name, code: item.code, current: item.currentPrice, marketValue: item.marketValue, pnl: item.pnl, type: item.type, action, unit: "cny" };
  };

  const buildUsExecution = (code: string, action: string): ExecutionItem | null => {
    const item = findUs(code);
    if (!item) return null;
    return { name: item.code, code: item.name, current: item.currentPrice, marketValue: item.marketValue, pnl: item.pnl, type: item.type, action, unit: "usd" };
  };

  const aShareDesk = [
    buildAShareExecution("588750", `第一大仓，观察 ${formatCny(tradePlan.kcChipWatchPrice)} 附近承接；冲高不追。`),
    buildAShareExecution("688008", `浮盈核心仓，跌破 ${formatCny(tradePlan.lqTechTrailingStop)} 触发锁盈复核。`),
    buildAShareExecution("588170", "和科创芯50高度同向，不能单独幻想，要合并看半导体风险。"),
    buildAShareExecution("588230", "弹性仓，回撤时看承接，别和科创芯50同时加。"),
    buildAShareExecution("600036", "防守仓，不因为科技回撤就乱砍，主要看账户稳定器作用。"),
  ].filter(isExecutionItem);

  const usDesk = [
    buildUsExecution("META", "美股第一大仓，先看是否稳住核心锚，不随便加大单票集中度。"),
    buildUsExecution("AMD", `强势贡献仓，跌破 ${formatUsd(tradePlan.amdTrailingStop)} 触发移动止盈复核。`),
    buildUsExecution("ANET", `新仓浮亏票，跌破 ${formatUsd(tradePlan.anetStopLoss)} 优先风控，不补跌。`),
    buildUsExecution("TME", "中概修复仓，先看修复持续性，不作为加仓主攻。"),
    buildUsExecution("APH", "偏稳核心趋势，弹性不如 AMD，但可以作为美股科技稳定器。"),
    buildUsExecution("RMBS", "半导体存储链小仓，观察为主，不抢主仓位置。"),
  ].filter(isExecutionItem);

  const activeDeskItems = activeDesk === "a-share" ? aShareDesk : usDesk;
  const activeDeskSummary = activeDesk === "a-share"
    ? "A股先看科创芯50、澜起和科创半导的联动，再看招商银行是否提供稳定器。"
    : "美股先看 META 是否稳住核心锚，再看 AMD 保护利润，ANET 严格按新仓风控。";

  const planRows = useMemo(() => {
    return [
      {
        name: "澜起科技移动止盈线",
        current: lq?.currentPrice ?? 0,
        line: tradePlan.lqTechTrailingStop,
        unit: "cny" as const,
        note: "浮盈核心仓，跌破操作线后重点复核是否分批锁盈。",
        action: "跌破后先考虑锁 10%-20%，不做情绪化全卖。",
      },
      {
        name: "科创芯50观察位",
        current: kcChip?.currentPrice ?? 0,
        line: tradePlan.kcChipWatchPrice,
        unit: "cny" as const,
        note: "第一大仓，靠近观察位时看承接，不盲目加仓。",
        action: "若放量跌破且无承接，优先降低同类科技仓集中度。",
      },
      {
        name: "AMD 移动止盈线",
        current: amd?.currentPrice ?? 0,
        line: tradePlan.amdTrailingStop,
        unit: "usd" as const,
        note: "强势贡献仓，跌破移动止盈线后复核是否锁利润。",
        action: "跌破后优先保护利润；若强势站回再重新观察。",
      },
      {
        name: "ANET 止损线",
        current: anet?.currentPrice ?? 0,
        line: tradePlan.anetStopLoss,
        unit: "usd" as const,
        note: "新仓浮亏，跌破止损线优先执行风控。",
        action: "这类新仓不补跌，跌破纪律线优先退出或降到观察仓。",
      },
    ];
  }, [tradePlan, lq, kcChip, amd, anet]);

  const scenarioPlans = [
    { title: "强势上冲", badge: "不追", text: "科创、半导体、AMD 继续冲高时，不新增同方向仓位。只做两件事：上移止盈线，挑浮盈大的仓位分批锁一点。" },
    { title: "正常震荡", badge: "等待", text: "价格没有触发操作线时，不为了操作而操作。重点看科创芯50和澜起是否稳住，ANET 是否继续弱。" },
    { title: "放量回撤", badge: "执行", text: "优先处理新仓浮亏和高相关仓位：ANET 看止损，澜起/AMD 看移动止盈，科创系看是否需要合并降低集中度。" },
  ];

  const priorityQueue = [
    {
      title: marketMode === "down" ? "第一优先：ANET 风控" : "第一优先：别追高",
      badge: marketMode === "down" ? "先处理" : "管住手",
      text: marketMode === "down"
        ? `ANET 新仓浮亏，若靠近或跌破 ${formatUsd(tradePlan.anetStopLoss)}，先降风险，不补仓摊低。`
        : "盘面越强，越容易上头。先看已有仓位能不能锁利润，不新增同方向。",
    },
    { title: "第二优先：澜起 / AMD 移动止盈", badge: "保护利润", text: `澜起看 ${formatCny(tradePlan.lqTechTrailingStop)}，AMD 看 ${formatUsd(tradePlan.amdTrailingStop)}。触发后不是恐慌卖，是复核是否锁一部分利润。` },
    { title: "第三优先：科创系集中度", badge: "降重叠", text: `科创芯50观察位 ${formatCny(tradePlan.kcChipWatchPrice)}。如果科创芯50、科创半导、科创200同向走弱，优先合并看风险，不分开幻想。` },
    { title: "第四优先：现金垫恢复", badge: "分批做", text: `当前若要恢复目标现金，静态口径还需释放约 ${formatAmount(cashGap)}，分 2-3 次做，不一笔砍完。` },
  ];

  const releasePlans = [
    `若要把账户内现金恢复到 ${formatPct(tradePlan.cashTargetPct)}，按静态口径约需释放 ${formatAmount(cashGap)}。`,
    `对应账户总资产约 ${formatPct(releasePct)}，可以分 2-3 次完成，不建议一笔砍完。`,
    "优先从浮盈大、同质化强、当天冲高的科技仓里释放，不优先砍防守仓。",
  ];

  const forbiddenActions = [
    "科创和半导体已经高集中时，不再因为涨得好继续叠同方向仓位。",
    "ANET 如果继续弱，不用补仓摊低成本，先尊重止损线。",
    "现金目标没有恢复前，不做新的大额趋势仓。",
  ];

  const updateItems: { key: keyof UpdateChecklist; label: string; desc: string }[] = [
    { key: "aShareScreenshot", label: "A股截图已上传", desc: dataVersion.aShare },
    { key: "usScreenshot", label: "美股截图已上传", desc: dataVersion.us },
    { key: "portfolioUpdated", label: "portfolio.ts 已更新", desc: "持仓、数量、成本、现价、盈亏检查完成" },
    { key: "vercelChecked", label: "Vercel 已部署", desc: "线上页面已刷新看到新数据" },
    { key: "dataVersionChecked", label: "数据版本已核对", desc: "页面口径与今日截图一致" },
  ];

  const noteTemplate = `盘面状态：${modeOptions.find((item) => item.id === marketMode)?.title ?? "未选择"}\n执行台：${activeDesk === "a-share" ? "A股" : "美股"}\n主动作：${activeModeCopy.title}\n现金缺口：${formatAmount(cashGap)}\n观察：${intradayNote.observation || "未填写"}\n决定：${intradayNote.decision || "未填写"}`;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">手动操作线设置</h1>
              <Badge variant="warning">核心功能深化版</Badge>
              <Badge variant={storageReady ? "success" : "outline"}>{storageReady ? "已本地保存" : "保存准备中"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">A股/美股分区 · 本地保存 · 截图更新入口 · 多风险灯</p>
          </div>
          <a className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50" href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />今日执行原则</CardTitle>
            <CardDescription className="text-slate-300">所有手动操作线、盘中记录、截图更新清单都会保存在当前手机浏览器里。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-100">
            <p>1. 大涨后不追高，先看是否要锁盈。</p>
            <p>2. A股和美股分开执行，不混在一起判断。</p>
            <p>3. 新仓浮亏票优先讲纪律，老仓浮盈票优先讲保护。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>多风险灯</CardTitle>
            <CardDescription>比一个总风险灯更细：仓位、现金、集中度、新仓、浮盈保护分开看。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {riskLights.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{item.title}</p>
                  <Badge variant={item.variant}>{item.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>当前盘面状态</CardTitle>
            <CardDescription>盘中先选一个状态，页面会给出对应主动作，避免临时上头。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {modeOptions.map((item) => {
                const selected = marketMode === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => setMarketMode(item.id)} className={`rounded-2xl border p-3 text-left transition ${selected ? "border-slate-950 bg-slate-950 text-white" : item.tone}`}>
                    <p className="text-sm font-black">{item.title}</p>
                    <p className={`mt-1 text-xs ${selected ? "text-white/70" : "text-slate-500"}`}>{item.badge}</p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="font-black text-slate-950">{activeModeCopy.title}</p>
              <p className="mt-2 text-sm text-slate-600">{activeModeCopy.text}</p>
              <p className="mt-2 text-sm font-bold text-slate-800">{activeModeCopy.order}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>A股 / 美股分开执行台</CardTitle>
            <CardDescription>{activeDeskSummary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {deskOptions.map((item) => {
                const selected = activeDesk === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => setActiveDesk(item.id)} className={`rounded-2xl border p-3 text-left transition ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}>
                    <p className="font-black">{item.title}</p>
                    <p className={`mt-1 text-xs ${selected ? "text-white/70" : "text-slate-500"}`}>{item.desc}</p>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3">
              {activeDeskItems.map((item) => (
                <ExecutionCard key={`${item.name}-${item.code}`} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>截图更新入口</CardTitle>
            <CardDescription>每天更新持仓时按这个清单走，完成 {checklistDone}/5。这个清单也会本地保存。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {updateItems.map((item) => (
              <label key={item.key} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={updateChecklist[item.key]}
                  onChange={(event) => setUpdateChecklist({ ...updateChecklist, [item.key]: event.target.checked })}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="block font-black text-slate-900">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.desc}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>盘中执行优先级</CardTitle>
            <CardDescription>先按顺序看，不要每只票都同时盯。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {priorityQueue.map((item, index) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{index + 1}. {item.title}</p>
                  <Badge variant={index === 0 ? "warning" : "outline"}>{item.badge}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>三档盘面预案</CardTitle>
            <CardDescription>每天开盘前先读这里，避免盘中临时上头。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {scenarioPlans.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{item.title}</p>
                  <Badge variant={item.badge === "执行" ? "warning" : "outline"}>{item.badge}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.text}</p>
              </div>
            ))}
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />操作线复核表</CardTitle>
            <CardDescription>当前价格来自静态持仓数据，不是实时行情。手动输入会本地保存。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {planRows.map((item) => {
              const distancePct = item.current === 0 ? 0 : ((item.current - item.line) / item.current) * 100;
              const nearLine = distancePct < 5;
              return (
                <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.note}</p>
                    </div>
                    <Badge variant={nearLine ? "warning" : "outline"}>{nearLine ? "接近触发" : "观察"}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <MiniMetric label="静态现价" value={item.unit === "cny" ? formatCny(item.current) : formatUsd(item.current)} />
                    <MiniMetric label="操作线" value={item.unit === "cny" ? formatCny(item.line) : formatUsd(item.line)} />
                    <MiniMetric label="距离" value={formatPct(distancePct)} />
                  </div>
                  <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">触发后动作：{item.action}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />现金目标测算</CardTitle>
            <CardDescription>用来估算账户内现金垫是否够。场外现金仍单独保留，不代表可以忽视券商账户仓位。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <MiniMetric label="A股券商账户仓位" value={formatPct(accountSnapshot.aShare.brokerPositionPct)} />
            <MiniMetric label="账户内现金比例" value={formatPct(currentAccountCashPct)} />
            <MiniMetric label="目标现金金额" value={formatAmount(cashTargetAmount)} />
            <MiniMetric label="还需释放现金" value={formatAmount(cashGap)} />
            <MiniMetric label="场外机动资金" value={`约 ${(accountSnapshot.aShare.offsiteCash / 10000).toFixed(0)} 万元`} />
            <MiniMetric label="目标现金比例" value={formatPct(tradePlan.cashTargetPct)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>减仓金额参考</CardTitle>
            <CardDescription>这是金额框架，不是机械卖出指令。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {releasePlans.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                <Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge>
                <p className="font-medium text-slate-700">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-red-100 bg-red-50/70">
          <CardHeader>
            <CardTitle>今日禁止动作</CardTitle>
            <CardDescription>这部分专门用来管住手。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {forbiddenActions.map((item) => (
              <div key={item} className="rounded-2xl bg-white/70 p-3 font-medium text-red-800">{item}</div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>盘中记录卡</CardTitle>
            <CardDescription>先写观察，再写决定。写不清楚，就先不动；内容会本地保存。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <label className="grid gap-2 font-medium">
              我现在看到的盘面
              <textarea className="min-h-24 rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400" placeholder="比如：科创芯50放量但没有跌破观察位，澜起还在止盈线上方，ANET继续弱。" value={intradayNote.observation} onChange={(event) => setIntradayNote({ ...intradayNote, observation: event.target.value })} />
            </label>
            <label className="grid gap-2 font-medium">
              我准备执行的动作
              <textarea className="min-h-24 rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400" placeholder="比如：不加仓；若澜起跌破185，先锁一部分；ANET跌破150不补仓。" value={intradayNote.decision} onChange={(event) => setIntradayNote({ ...intradayNote, decision: event.target.value })} />
            </label>
            <div className="whitespace-pre-line rounded-2xl bg-slate-50 p-3 font-medium text-slate-700">{noteTemplate}</div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-blue-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />数据口径</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-700">
            <p><span className="font-bold text-slate-900">A股：</span>{dataVersion.aShare}</p>
            <p><span className="font-bold text-slate-900">美股：</span>{dataVersion.us}</p>
            <p>这页的所有价格都来自静态持仓，不是实时行情；实时买卖前仍需重新看盘。</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ExecutionCard({ item }: { item: ExecutionItem }) {
  const positive = item.pnl >= 0;
  const price = item.unit === "cny" ? formatCny(item.current) : formatUsd(item.current);
  const value = item.unit === "cny" ? formatAmount(item.marketValue) : formatUsd(item.marketValue);
  const pnl = item.unit === "cny" ? formatAmount(item.pnl) : formatUsd(item.pnl);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{item.name}</p>
          <p className="text-xs text-slate-500">{item.code} · {item.type}</p>
        </div>
        <Badge variant={positive ? "success" : "warning"}>{positive ? "浮盈" : "浮亏"}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="静态现价" value={price} />
        <MiniMetric label="市值" value={value} />
        <MiniMetric label="盈亏" value={pnl} />
      </div>
      <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">执行口径：{item.action}</p>
    </div>
  );
}

function TradeInput({ label, value, onChange, prefix, suffix, step = "0.01" }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; step?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <label className="grid gap-2 text-sm font-medium">
          {label}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            {prefix && <span className="text-sm font-bold text-slate-500">{prefix}</span>}
            <Input className="border-none p-0 shadow-none focus-visible:ring-0" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
            {suffix && <span className="text-sm font-bold text-slate-500">{suffix}</span>}
          </div>
        </label>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-black text-slate-950">{value}</p>
    </div>
  );
}
