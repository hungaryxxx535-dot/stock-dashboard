"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BookOpenCheck,
  CircleDollarSign,
  Gauge,
  Home,
  Landmark,
  Settings,
  ShieldAlert,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import { PortfolioScreenshotImport } from "@/components/portfolio-screenshot-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  aShareHoldings,
  accountSnapshot,
  dataVersion,
  operationRecords,
  portfolioParams,
  settingsNotes,
  usHoldings,
} from "@/data/portfolio";
import type { AShareHolding } from "@/data/portfolio";
import { loadImportedPortfolio, type ImportedPortfolioSnapshot } from "@/lib/importedPortfolio";
import { cn } from "@/lib/utils";

type TabId = "overview" | "a-share" | "us" | "import" | "risk" | "records" | "settings";

type PortfolioTotals = {
  aShareValue: number;
  aSharePnl: number;
  usValueUsd: number;
  usValueCny: number;
  usPnlUsd: number;
  totalAssets: number;
  stockPosition: number;
  techConcentration: number;
  maxHoldingPct: number;
};

type RiskCheck = {
  title: string;
  status: "警惕" | "执行" | "观察";
  danger: boolean;
  description: string;
};

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "overview", label: "总览", icon: Home },
  { id: "a-share", label: "A股", icon: Landmark },
  { id: "us", label: "美股", icon: CircleDollarSign },
  { id: "import", label: "导入", icon: UploadCloud },
  { id: "risk", label: "风险", icon: ShieldAlert },
  { id: "records", label: "记录", icon: BookOpenCheck },
  { id: "settings", label: "设置", icon: Settings },
];

const formatCny = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const formatUsd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const formatPct = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;

export default function StockDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [offsiteCash, setOffsiteCash] = useState(accountSnapshot.aShare.offsiteCash);
  const [usdRate, setUsdRate] = useState(portfolioParams.usdRate);
  const [importedSnapshot, setImportedSnapshot] = useState<ImportedPortfolioSnapshot | null>(null);

  useEffect(() => {
    setImportedSnapshot(loadImportedPortfolio());
  }, []);

  const currentAShareHoldings = importedSnapshot?.holdings?.length ? importedSnapshot.holdings : aShareHoldings;
  const accountCash = importedSnapshot?.account.availableCash || accountSnapshot.aShare.availableCash;
  const cash = accountCash + offsiteCash;

  const totals = useMemo<PortfolioTotals>(() => {
    const holdingsValue = currentAShareHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const holdingsPnl = currentAShareHoldings.reduce((sum, item) => sum + item.pnl, 0);
    const aShareValue = importedSnapshot?.account.marketValue || holdingsValue;
    const aSharePnl = importedSnapshot?.account.totalPnl || holdingsPnl;
    const aShareAccountAssets = importedSnapshot?.account.totalAssets || aShareValue + accountCash;
    const usValueUsd = usHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const usPnlUsd = usHoldings.reduce((sum, item) => sum + item.pnl, 0);
    const usValueCny = usValueUsd * usdRate;
    const totalAssets = aShareAccountAssets + offsiteCash + usValueCny;
    const techValue =
      currentAShareHoldings
        .filter((item) => item.type !== "防守仓")
        .reduce((sum, item) => sum + item.marketValue, 0) + usValueCny;
    const holdingValues = [
      ...currentAShareHoldings.map((item) => item.marketValue),
      ...usHoldings.map((item) => item.marketValue * usdRate),
    ];
    const maxHoldingValue = holdingValues.length ? Math.max(...holdingValues) : 0;

    return {
      aShareValue,
      aSharePnl,
      usValueUsd,
      usValueCny,
      usPnlUsd,
      totalAssets,
      stockPosition: totalAssets > 0 ? ((aShareValue + usValueCny) / totalAssets) * 100 : 0,
      techConcentration: totalAssets > 0 ? (techValue / totalAssets) * 100 : 0,
      maxHoldingPct: totalAssets > 0 ? (maxHoldingValue / totalAssets) * 100 : 0,
    };
  }, [accountCash, currentAShareHoldings, importedSnapshot, offsiteCash, usdRate]);

  const brokerPositionPct =
    importedSnapshot?.account.brokerPositionPct ||
    (totals.aShareValue + accountCash > 0 ? (totals.aShareValue / (totals.aShareValue + accountCash)) * 100 : 0);
  const cashPct = totals.totalAssets > 0 ? (cash / totals.totalAssets) * 100 : 0;
  const riskLight =
    totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow ||
    totals.stockPosition > portfolioParams.riskThresholds.stockPositionYellow
      ? "黄灯"
      : "绿灯";
  const todayCommand =
    riskLight === portfolioParams.riskLight
      ? portfolioParams.todayCommand
      : "今日总指令：按计划持有，等待更高胜率信号。";
  const importedAt = importedSnapshot
    ? new Date(importedSnapshot.importedAt).toLocaleString("zh-CN", { hour12: false })
    : "";

  return (
    <main className="min-h-screen bg-slate-100 pb-28 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 py-3 sm:px-5 lg:py-6">
        <header className="sticky top-0 z-20 -mx-3 border-b border-slate-200/70 bg-slate-100/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:static lg:border-none lg:bg-transparent lg:px-0 lg:pb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight sm:text-3xl">非哥股票作战台</h1>
                <Badge variant={importedSnapshot ? "success" : "warning"}>
                  {importedSnapshot ? "A股截图已导入" : "默认静态持仓"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                A股以持仓截图为准 · 美股后续接富途OpenD · 不自动下单
              </p>
            </div>
            <Badge variant={riskLight === "黄灯" ? "warning" : "success"} className="shrink-0 px-3 py-1 text-sm">
              风险灯：{riskLight}
            </Badge>
          </div>
          <nav className="mt-3 hidden gap-2 overflow-x-auto no-scrollbar lg:flex" aria-label="顶部辅助导航">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                className="h-9 shrink-0 rounded-full px-4 text-xs"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </nav>
        </header>

        <section className="flex-1 pt-3 lg:pt-0">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "overview" && (
              <Overview
                totals={totals}
                cash={cash}
                cashPct={cashPct}
                riskLight={riskLight}
                todayCommand={todayCommand}
                brokerPositionPct={brokerPositionPct}
                importedAt={importedAt}
              />
            )}
            {activeTab === "a-share" && (
              <ASharePage
                totalAssets={totals.totalAssets}
                holdings={currentAShareHoldings}
                importedAt={importedAt}
              />
            )}
            {activeTab === "us" && <UsPage totalAssets={totals.totalAssets} usdRate={usdRate} />}
            {activeTab === "import" && (
              <PortfolioScreenshotImport
                currentHoldings={currentAShareHoldings}
                currentSnapshot={importedSnapshot}
                onApply={(snapshot) => setImportedSnapshot(snapshot)}
                onClear={() => setImportedSnapshot(null)}
              />
            )}
            {activeTab === "risk" && (
              <RiskPage
                totals={totals}
                cash={cash}
                todayCommand={todayCommand}
                brokerPositionPct={brokerPositionPct}
                offsiteCash={offsiteCash}
              />
            )}
            {activeTab === "records" && <RecordsPage />}
            {activeTab === "settings" && (
              <SettingsPage
                accountCash={accountCash}
                offsiteCash={offsiteCash}
                setOffsiteCash={setOffsiteCash}
                usdRate={usdRate}
                setUsdRate={setUsdRate}
                importedAt={importedAt}
              />
            )}
          </motion.div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-1 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden" aria-label="底部主导航">
        <div className="mx-auto grid max-w-lg grid-cols-7 gap-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold transition",
                  selected ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

function Overview({
  totals,
  cash,
  cashPct,
  riskLight,
  todayCommand,
  brokerPositionPct,
  importedAt,
}: {
  totals: PortfolioTotals;
  cash: number;
  cashPct: number;
  riskLight: string;
  todayCommand: string;
  brokerPositionPct: number;
  importedAt: string;
}) {
  const focusCards = [
    { label: "今日总指令", value: todayCommand.replace("今日总指令：", ""), icon: Gauge, tone: "bg-slate-950 text-white", wide: true },
    { label: "总仓位", value: formatPct(totals.stockPosition), hint: "A股＋美股 / 整体资金", icon: TrendingUp },
    { label: "科技集中度", value: formatPct(totals.techConcentration), hint: "科创、AI、通信、美股科技", icon: Activity },
    { label: "现金垫", value: `${formatCny(cash)} · ${formatPct(cashPct)}`, hint: "账户内现金＋场外现金", icon: Banknote },
    { label: "风险灯", value: riskLight, hint: riskLight === "黄灯" ? "先防守，不追高" : "按计划执行", icon: ShieldAlert },
  ];
  const reviewItems = [
    `A股券商账户仓位 ${formatPct(brokerPositionPct)}，注意与整体资金仓位区分`,
    "科创芯50、科创半导、科创200、澜起科技应合并看核心风险暴露",
    "美股当前仍为静态底表，富途OpenD接入前不要把页面价格视为实时行情",
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {focusCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className={cn("overflow-hidden border-none shadow-sm", item.wide && "col-span-2", item.tone ?? "bg-white")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn("text-xs font-semibold", item.tone ? "text-white/70" : "text-slate-500")}>{item.label}</p>
                    <p className={cn("mt-2 font-black leading-tight", item.wide ? "text-2xl" : "text-xl")}>{item.value}</p>
                    {item.hint && <p className={cn("mt-1 text-xs", item.tone ? "text-white/70" : "text-slate-500")}>{item.hint}</p>}
                  </div>
                  <div className={cn("rounded-2xl p-2", item.tone ? "bg-white/15" : "bg-slate-100")}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className={importedAt ? "border-emerald-200 bg-emerald-50/70" : "border-blue-100 bg-blue-50/70"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />数据状态</CardTitle>
          <CardDescription>
            {importedAt ? `A股持仓来自本机截图导入，更新时间：${importedAt}` : `A股仍使用代码中的默认底表：${dataVersion.aShare}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-700">
          <p><span className="font-bold text-slate-900">A股：</span>{importedAt ? "截图OCR＋人工确认，本机保存" : dataVersion.aShare}</p>
          <p><span className="font-bold text-slate-900">美股：</span>{dataVersion.us}</p>
          <p><span className="font-bold text-slate-900">提醒：</span>持仓事实与实时行情分开管理；没有实时数据时不生成具体买卖价格。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>今日复核清单</CardTitle>
          <CardDescription>先核数据，再看风险，最后才考虑操作。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {reviewItems.map((item, index) => (
            <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
              <Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge>
              <p className="font-medium text-slate-700">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="A股市值" value={formatCny(totals.aShareValue)} sub={`盈亏 ${formatCny(totals.aSharePnl)}`} />
        <MetricCard label="美股市值" value={formatUsd(totals.usValueUsd)} sub={`折合 ${formatCny(totals.usValueCny)}`} />
        <MetricCard label="整体资产估算" value={formatCny(totals.totalAssets)} sub="A股账户＋场外现金＋美股折算" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-black">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ASharePage({ totalAssets, holdings, importedAt }: { totalAssets: number; holdings: AShareHolding[]; importedAt: string }) {
  return (
    <Holdings
      title={importedAt ? "A股截图导入持仓" : "A股默认持仓"}
      description={importedAt ? `本机截图导入于 ${importedAt}；现价与盈亏以截图时点为准。` : "尚未导入新截图，当前展示代码中的静态底表。"}
    >
      {holdings.map((item) => (
        <HoldingCard
          key={item.code}
          title={item.name}
          code={item.code}
          value={formatCny(item.marketValue)}
          pnl={item.pnl}
          position={totalAssets > 0 ? (item.marketValue / totalAssets) * 100 : 0}
          badges={[item.type, item.suggestion]}
          rows={[
            ["持仓数量", item.quantity.toLocaleString("zh-CN")],
            ["成本价", `¥${item.costPrice.toFixed(3)}`],
            ["截图现价", `¥${item.currentPrice.toFixed(3)}`],
            ["备注", item.note],
          ]}
        />
      ))}
    </Holdings>
  );
}

function UsPage({ totalAssets, usdRate }: { totalAssets: number; usdRate: number }) {
  return (
    <Holdings title="美股静态持仓" description="当前仍使用静态底表；下一阶段只通过富途OpenD同步美股。">
      {usHoldings.map((item) => (
        <HoldingCard
          key={item.code}
          title={item.name}
          code={item.code}
          value={formatUsd(item.marketValue)}
          pnl={item.pnl}
          position={totalAssets > 0 ? ((item.marketValue * usdRate) / totalAssets) * 100 : 0}
          badges={[item.type, item.trend]}
          rows={[
            ["持仓数量", `${item.quantity} 股`],
            ["成本价", `$${item.costPrice.toFixed(2)}`],
            ["现价", `$${item.currentPrice.toFixed(2)}`],
            ["止损价", `$${item.stopLoss.toFixed(2)}`],
            ["目标价", `$${item.targetPrice.toFixed(2)}`],
            ["备注", item.note],
          ]}
        />
      ))}
    </Holdings>
  );
}

function Holdings({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-black">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </div>
  );
}

function HoldingCard({ title, code, value, pnl, position, badges, rows }: { title: string; code: string; value: string; pnl: number; position: number; badges: string[]; rows: [string, string][] }) {
  const positive = pnl >= 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">{title}</h3>
            <p className="text-sm text-slate-500">{code}</p>
          </div>
          <div className="text-right">
            <p className="font-black">{value}</p>
            <p className={cn("text-sm font-bold", positive ? "text-red-600" : "text-emerald-600")}>
              {positive ? "+" : ""}{pnl.toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
        <div className="my-3 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-slate-900" style={{ width: `${Math.min(position * 4, 100)}%` }} />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="secondary">仓位 {formatPct(position)}</Badge>
          {badges.map((badge) => (
            <Badge key={badge} variant={badge.includes("锁盈") || badge.includes("风险") ? "warning" : "outline"}>{badge}</Badge>
          ))}
        </div>
        <div className="grid gap-2 text-sm">
          {rows.map(([label, val]) => (
            <div key={label} className="flex justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2">
              <span className="shrink-0 text-slate-500">{label}</span>
              <span className="text-right font-medium">{val}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskPage({
  totals,
  cash,
  todayCommand,
  brokerPositionPct,
  offsiteCash,
}: {
  totals: PortfolioTotals;
  cash: number;
  todayCommand: string;
  brokerPositionPct: number;
  offsiteCash: number;
}) {
  const cashPct = totals.totalAssets > 0 ? (cash / totals.totalAssets) * 100 : 0;
  const items = [
    { label: "整体股票仓位", value: formatPct(totals.stockPosition), danger: totals.stockPosition > 78, note: "纳入账户内现金、场外现金和美股折算。" },
    { label: "科创/科技集中度", value: formatPct(totals.techConcentration), danger: totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow, note: "芯片、AI、通信、美股科技相关度高。" },
    { label: "单票集中风险", value: formatPct(totals.maxHoldingPct), danger: totals.maxHoldingPct > 16, note: "单一标的过大时优先控制回撤。" },
    { label: "现金垫是否充足", value: formatPct(cashPct), danger: cashPct < portfolioParams.riskThresholds.cashPctWarning, note: "账户内与场外现金必须同时纳入。" },
  ];
  const checks: RiskCheck[] = [
    { title: "科技仓位是否过高", status: totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow ? "警惕" : "观察", danger: totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow, description: "科创、AI、通信与美股科技相关性高，集中度过高时不再叠加同方向仓位。" },
    { title: "截图数据是否闭合", status: "执行", danger: true, description: "每次导入后核对总资产、总市值、账户内现金和持仓明细合计，发现差额先修数据。" },
    { title: "是否混淆券商仓位和整体仓位", status: brokerPositionPct > 80 ? "警惕" : "观察", danger: brokerPositionPct > 80, description: "券商账户仓位不等于整体仓位，场外现金必须单列。" },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />当前风险结论</CardTitle>
          <CardDescription className="text-amber-800">{todayCommand}</CardDescription>
          <p className="text-sm text-amber-800">A股券商账户仓位约 {formatPct(brokerPositionPct)}，但整体资金口径还要纳入场外现金。</p>
          <p className="text-sm text-amber-800">当前手动维护场外机动资金约 {(offsiteCash / 10000).toFixed(0)} 万元。</p>
        </CardHeader>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{item.label}</p>
                <Badge variant={item.danger ? "warning" : "success"}>{item.danger ? "需警惕" : "可接受"}</Badge>
              </div>
              <p className="mt-3 text-2xl font-black">{item.value}</p>
              <p className="mt-1 text-sm text-slate-500">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>三项数据纪律</CardTitle>
          <CardDescription>没有完成数据核验，不进入具体买卖判断。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {checks.map((check) => (
            <div key={check.title} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{check.title}</p>
                <Badge variant={check.danger ? "warning" : "success"}>{check.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">{check.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RecordsPage() {
  const updateFlow = [
    "在同花顺或券商App打开账户汇总和全部A股持仓",
    "进入“导入”页，一次上传账户汇总和全部持仓截图",
    "等待浏览器本机OCR完成",
    "逐项核对代码、数量、成本、现价、市值和盈亏",
    "检查持仓明细合计是否与账户总市值闭合",
    "确认后应用到本机作战台",
    "场外现金仍在设置页单独维护",
    "美股不使用截图覆盖，后续只接富途OpenD",
  ];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-black">操作记录</h2>
        <p className="text-sm text-slate-500">记录交易原因，同时固定持仓截图更新流程。</p>
      </div>
      <Card className="border-slate-900 bg-slate-950 text-white">
        <CardHeader>
          <CardTitle>今日操作备忘</CardTitle>
          <CardDescription className="text-slate-300">先确认持仓事实和行情时间，再讨论操作。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-100">
          <p>1. 没有实时行情，不编价格、均线和涨跌幅。</p>
          <p>2. 截图识别结果必须人工确认，不能无提示覆盖。</p>
          <p>3. 券商仓位与整体资金仓位分开计算。</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>持仓截图更新流程</CardTitle>
          <CardDescription>只有发生买入、卖出、加减仓或现金明显变化时才需要重新导入。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {updateFlow.map((item, index) => (
            <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
              <Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge>
              <p className="font-medium text-slate-700">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      {operationRecords.map((item) => (
        <Card key={`${item.date}-${item.symbol}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{item.date} · {item.market}</p>
                <h3 className="text-lg font-black">{item.symbol}</h3>
              </div>
              <Badge>{item.action}</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm">
              <p><span className="text-slate-500">操作原因：</span>{item.reason}</p>
              <p><span className="text-slate-500">结果复盘：</span>{item.result}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SettingsPage({
  accountCash,
  offsiteCash,
  setOffsiteCash,
  usdRate,
  setUsdRate,
  importedAt,
}: {
  accountCash: number;
  offsiteCash: number;
  setOffsiteCash: (value: number) => void;
  usdRate: number;
  setUsdRate: (value: number) => void;
  importedAt: string;
}) {
  const roadmap = [
    ["阶段1", "静态持仓展示", "已完成"],
    ["阶段2", "A股持仓截图OCR导入", importedAt ? "已完成" : "当前阶段"],
    ["阶段3", "截图历史快照与变动对比", "待做"],
    ["阶段4", "富途OpenD同步美股", "待做"],
    ["阶段5", "候选池与多维投研评分", "待做"],
    ["阶段6", "盘前、盘中、收盘简报", "待做"],
    ["阶段7", "风险提醒推送", "待做"],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>资金参数设置</CardTitle>
          <CardDescription>账户内现金来自A股截图；场外资金和美股折算汇率单独维护。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="grid gap-2 text-sm font-medium">
            A股账户内现金（来自截图，只读）
            <Input type="number" value={accountCash} readOnly className="bg-slate-100" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            场外机动现金（人民币）
            <Input type="number" value={offsiteCash} onChange={(event) => setOffsiteCash(Number(event.target.value))} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            美股折算汇率
            <Input type="number" step="0.01" value={usdRate} onChange={(event) => setUsdRate(Number(event.target.value))} />
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />当前数据架构</CardTitle>
          <CardDescription>A股截图导入与美股富途同步分开处理，不再尝试用富途覆盖全部账户。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-600">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-bold text-slate-900">数据版本</p>
            <p>A股：{importedAt ? `截图导入 ${importedAt}` : dataVersion.aShare}</p>
            <p>美股：{dataVersion.us}</p>
            <p>港股：继续作为独立模块维护，不按账户拆分。</p>
          </div>
          <div className="grid gap-2">
            {settingsNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>后续升级路线</CardTitle>
          <CardDescription>先把截图导入跑稳，再加入持仓历史、富途美股和投研能力。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {roadmap.map(([stage, title, status]) => (
            <div key={stage} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
              <p className="font-bold text-slate-900">{stage}：{title}</p>
              <Badge variant={status === "当前阶段" ? "warning" : status === "已完成" ? "success" : "outline"}>{status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
