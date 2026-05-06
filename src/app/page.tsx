"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TabId = "overview" | "a-share" | "us" | "risk" | "records" | "settings";
type Suggestion = "持有" | "观察" | "分批锁盈" | "谨慎" | "加仓候选";

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

type AShareHolding = {
  name: string;
  code: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  type: "核心仓" | "趋势仓" | "防守仓" | "观察仓";
  suggestion: Suggestion;
  note: string;
};

type UsHolding = {
  name: string;
  code: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  stopLoss: number;
  targetPrice: number;
  trend: string;
  type: "核心仓" | "中概仓" | "趋势仓" | "观察仓" | "杠杆仓";
  note: string;
};

type RiskCheck = {
  title: string;
  status: "警惕" | "执行" | "观察";
  danger: boolean;
  description: string;
};

const aShareHoldings: AShareHolding[] = [
  { name: "科创芯50", code: "588750", quantity: 204151, costPrice: 0.99, currentPrice: 1.25, marketValue: 255188, pnl: 53186, type: "核心仓", suggestion: "持有", note: "芯片主线底仓，仓位偏重，避免追高。" },
  { name: "科创半导", code: "588170", quantity: 236778, costPrice: 0.85, currentPrice: 0.95, marketValue: 223989, pnl: 22037, type: "核心仓", suggestion: "持有", note: "与科创芯50相关度高，合并看集中度。" },
  { name: "科创200", code: "588220", quantity: 182947, costPrice: 0.82, currentPrice: 0.88, marketValue: 161255, pnl: 11813, type: "核心仓", suggestion: "观察", note: "弹性仓，回撤时看承接。" },
  { name: "澜起科技", code: "688008", quantity: 1582, costPrice: 55.42, currentPrice: 89.43, marketValue: 141479, pnl: 53818, type: "核心仓", suggestion: "分批锁盈", note: "单票盈利丰厚，适合用移动止盈保护利润。" },
  { name: "通信ETF", code: "515880", quantity: 29750, costPrice: 1.09, currentPrice: 2.13, marketValue: 63279, pnl: 30990, type: "趋势仓", suggestion: "分批锁盈", note: "趋势强但浮盈大，回落破位减。" },
  { name: "AI创业板", code: "159381", quantity: 46244, costPrice: 0.94, currentPrice: 1.12, marketValue: 51744, pnl: 8269, type: "趋势仓", suggestion: "观察", note: "AI弹性补充，控制节奏。" },
  { name: "招商银行", code: "600036", quantity: 2700, costPrice: 35.33, currentPrice: 34.93, marketValue: 94320, pnl: -1083, type: "防守仓", suggestion: "持有", note: "组合稳定器，承担防守和分红属性。" },
  { name: "黄金ETF / 有色ETF", code: "518880 / 159980", quantity: 2632, costPrice: 3.41, currentPrice: 6.23, marketValue: 16386, pnl: 7416, type: "防守仓", suggestion: "持有", note: "风险对冲资产，不追涨，主要用于平滑组合波动。" },
];

const usHoldings: UsHolding[] = [
  { name: "Meta Platforms", code: "META", quantity: 24, costPrice: 472, currentPrice: 607.75, marketValue: 14586, pnl: 3258, stopLoss: 540, targetPrice: 680, trend: "上升趋势，核心持有", type: "核心仓", note: "美股核心锚。" },
  { name: "腾讯音乐", code: "TME", quantity: 500, costPrice: 7.62, currentPrice: 9.04, marketValue: 4522, pnl: 712, stopLoss: 8.1, targetPrice: 10.8, trend: "温和上行", type: "中概仓", note: "中概仓位，关注汇率和监管情绪。" },
  { name: "AMD", code: "AMD", quantity: 8, costPrice: 286, currentPrice: 351.63, marketValue: 2813, pnl: 525, stopLoss: 315, targetPrice: 395, trend: "高波动趋势", type: "趋势仓", note: "AI芯片弹性仓，避免放大亏损。" },
  { name: "Amphenol", code: "APH", quantity: 23, costPrice: 118.2, currentPrice: 144.3, marketValue: 3319, pnl: 600, stopLoss: 128, targetPrice: 158, trend: "核心趋势", type: "核心仓", note: "连接器龙头，偏稳。" },
  { name: "Rambus", code: "RMBS", quantity: 11, costPrice: 91, currentPrice: 111, marketValue: 1221, pnl: 220, stopLoss: 98, targetPrice: 128, trend: "观察上行", type: "观察仓", note: "小仓观察。" },
  { name: "Intel", code: "INTC", quantity: 4, costPrice: 78, currentPrice: 98.75, marketValue: 395, pnl: 83, stopLoss: 86, targetPrice: 115, trend: "剩余趋势仓", type: "趋势仓", note: "已减半，剩余小仓趋势仓。" },
  { name: "拼多多", code: "PDD", quantity: 4, costPrice: 86, currentPrice: 98.75, marketValue: 395, pnl: 51, stopLoss: 88, targetPrice: 118, trend: "观察修复", type: "观察仓", note: "中概小仓观察。" },
  { name: "Direxion MSFT 2X", code: "MSFU", quantity: 23, costPrice: 23, currentPrice: 27.91, marketValue: 642, pnl: 113, stopLoss: 24.5, targetPrice: 32, trend: "杠杆仓，高风险", type: "杠杆仓", note: "严格小仓，不能补跌。" },
];

const records = [
  { date: "2026-05-06", market: "A股", symbol: "澜起科技", action: "卖出计划", reason: "浮盈较大，防单票回撤", result: "触发冲高分批锁盈，不追求卖在最高点。" },
  { date: "2026-05-06", market: "A股", symbol: "通信ETF", action: "观察", reason: "趋势强但已经大涨", result: "只做止盈预案，不新增追高仓。" },
  { date: "2026-05-06", market: "美股", symbol: "META / AMD", action: "持有", reason: "核心仓趋势仍在", result: "用止损线管理，不因盘中波动随意加仓。" },
];

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "overview", label: "总览", icon: Home },
  { id: "a-share", label: "A股", icon: Landmark },
  { id: "us", label: "美股", icon: CircleDollarSign },
  { id: "risk", label: "风险", icon: ShieldAlert },
  { id: "records", label: "记录", icon: BookOpenCheck },
  { id: "settings", label: "设置", icon: Settings },
];

const formatCny = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const formatUsd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const formatPct = (value: number) => `${value.toFixed(1)}%`;

export default function StockDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [cash, setCash] = useState(128000);
  const [usdRate, setUsdRate] = useState(7.2);

  const totals = useMemo<PortfolioTotals>(() => {
    const aShareValue = aShareHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const aSharePnl = aShareHoldings.reduce((sum, item) => sum + item.pnl, 0);
    const usValueUsd = usHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const usPnlUsd = usHoldings.reduce((sum, item) => sum + item.pnl, 0);
    const usValueCny = usValueUsd * usdRate;
    const totalAssets = aShareValue + usValueCny + cash;
    const techValue = aShareHoldings
      .filter((item) => item.type !== "防守仓")
      .reduce((sum, item) => sum + item.marketValue, 0) + usValueCny;
    const maxHoldingValue = Math.max(
      ...aShareHoldings.map((item) => item.marketValue),
      ...usHoldings.map((item) => item.marketValue * usdRate),
    );

    return {
      aShareValue,
      aSharePnl,
      usValueUsd,
      usValueCny,
      usPnlUsd,
      totalAssets,
      stockPosition: ((aShareValue + usValueCny) / totalAssets) * 100,
      techConcentration: (techValue / totalAssets) * 100,
      maxHoldingPct: (maxHoldingValue / totalAssets) * 100,
    };
  }, [cash, usdRate]);

  const cashPct = (cash / totals.totalAssets) * 100;
  const riskLight = totals.techConcentration > 62 || totals.stockPosition > 80 ? "黄灯" : "绿灯";
  const todayCommand = riskLight === "黄灯" ? "今日总指令：不追高，优先看减仓与锁盈。" : "今日总指令：按计划持有，等待更高胜率信号。";

  return (
    <main className="min-h-screen bg-slate-100 pb-28 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 py-3 sm:px-5 lg:py-6">
        <header className="sticky top-0 z-20 -mx-3 border-b border-slate-200/70 bg-slate-100/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:static lg:border-none lg:bg-transparent lg:px-0 lg:pb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight sm:text-3xl">非哥股票作战台</h1>
                <Badge variant="warning">模拟数据 / Mock 数据</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">静态 MVP · 手机端以底部导航为主 · 不接真实行情</p>
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
            {activeTab === "overview" && <Overview totals={totals} cash={cash} cashPct={cashPct} riskLight={riskLight} todayCommand={todayCommand} />}
            {activeTab === "a-share" && <ASharePage totalAssets={totals.totalAssets} />}
            {activeTab === "us" && <UsPage totalAssets={totals.totalAssets} usdRate={usdRate} />}
            {activeTab === "risk" && <RiskPage totals={totals} cash={cash} todayCommand={todayCommand} />}
            {activeTab === "records" && <RecordsPage />}
            {activeTab === "settings" && <SettingsPage cash={cash} setCash={setCash} usdRate={usdRate} setUsdRate={setUsdRate} />}
          </motion.div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden" aria-label="底部主导航">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition",
                  selected ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

function Overview({ totals, cash, cashPct, riskLight, todayCommand }: { totals: PortfolioTotals; cash: number; cashPct: number; riskLight: string; todayCommand: string }) {
  const focusCards = [
    { label: "今日总指令", value: todayCommand.replace("今日总指令：", ""), icon: Gauge, tone: "bg-slate-950 text-white", wide: true },
    { label: "总仓位", value: formatPct(totals.stockPosition), hint: "股票资产 / 总资产", icon: TrendingUp },
    { label: "科技集中度", value: formatPct(totals.techConcentration), hint: "科创、AI、美股科技", icon: Activity },
    { label: "现金垫", value: `${formatCny(cash)} · ${formatPct(cashPct)}`, hint: "用于回撤防守", icon: Banknote },
    { label: "风险灯", value: riskLight, hint: riskLight === "黄灯" ? "先防守，不追高" : "按计划执行", icon: ShieldAlert },
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

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="A股市值" value={formatCny(totals.aShareValue)} sub={`盈亏 ${formatCny(totals.aSharePnl)}`} />
        <MetricCard label="美股市值" value={formatUsd(totals.usValueUsd)} sub={`折合 ${formatCny(totals.usValueCny)}`} />
        <MetricCard label="总资产估算" value={formatCny(totals.totalAssets)} sub="包含静态持仓与手动现金" />
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

function ASharePage({ totalAssets }: { totalAssets: number }) {
  return (
    <Holdings title="A股静态持仓" description="按第一轮 MVP 指定清单展示，价格与盈亏均为模拟数据。">
      {aShareHoldings.map((item) => (
        <HoldingCard
          key={item.code}
          title={item.name}
          code={item.code}
          value={formatCny(item.marketValue)}
          pnl={item.pnl}
          position={(item.marketValue / totalAssets) * 100}
          badges={[item.type, item.suggestion]}
          rows={[
            ["持仓数量", item.quantity.toLocaleString("zh-CN")],
            ["成本价", `¥${item.costPrice.toFixed(2)}`],
            ["现价", `¥${item.currentPrice.toFixed(2)}`],
            ["备注", item.note],
          ]}
        />
      ))}
    </Holdings>
  );
}

function UsPage({ totalAssets, usdRate }: { totalAssets: number; usdRate: number }) {
  return (
    <Holdings title="美股静态持仓" description="美元市值按设置中的汇率折算成人民币计算；所有行情为 Mock 数据。">
      {usHoldings.map((item) => (
        <HoldingCard
          key={item.code}
          title={item.name}
          code={item.code}
          value={formatUsd(item.marketValue)}
          pnl={item.pnl}
          position={((item.marketValue * usdRate) / totalAssets) * 100}
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
            <p className={cn("text-sm font-bold", positive ? "text-red-600" : "text-emerald-600")}>{positive ? "+" : ""}{pnl.toLocaleString("zh-CN")}</p>
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

function RiskPage({ totals, cash, todayCommand }: { totals: PortfolioTotals; cash: number; todayCommand: string }) {
  const cashPct = (cash / totals.totalAssets) * 100;
  const items = [
    { label: "整体股票仓位", value: formatPct(totals.stockPosition), danger: totals.stockPosition > 78, note: "超过 80% 不宜追高加仓。" },
    { label: "科创/科技集中度", value: formatPct(totals.techConcentration), danger: totals.techConcentration > 62, note: "芯片、AI、通信、美股科技相关度高。" },
    { label: "单票集中风险", value: formatPct(totals.maxHoldingPct), danger: totals.maxHoldingPct > 16, note: "单一标的过大时优先锁盈。" },
    { label: "现金垫是否充足", value: formatPct(cashPct), danger: cashPct < 10, note: "现金不足会降低应对回撤能力。" },
  ];
  const checks: RiskCheck[] = [
    { title: "科技仓位是否过高", status: totals.techConcentration > 62 ? "警惕" : "观察", danger: totals.techConcentration > 62, description: "科创、AI、通信与美股科技相关性高，集中度过高时不再叠加同方向仓位。" },
    { title: "单日大涨后是否追高", status: "执行", danger: true, description: "大涨日只更新止盈线与减仓计划，不做情绪化追单。" },
    { title: "是否需要减仓降低集中度", status: totals.stockPosition > 78 ? "执行" : "观察", danger: totals.stockPosition > 78, description: "优先从浮盈较大、相关性重叠的科技仓中分批降低集中度。" },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />今日是否适合操作</CardTitle>
          <CardDescription className="text-amber-800">{todayCommand}</CardDescription>
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
          <CardTitle>三项静态判断</CardTitle>
          <CardDescription>不接实时行情，仅用于第一轮 UI 验收的风险提醒。</CardDescription>
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
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-black">操作记录</h2>
        <p className="text-sm text-slate-500">用于记录买卖原因和结果复盘，MVP 先使用静态数据。</p>
      </div>
      <Card className="border-slate-900 bg-slate-950 text-white">
        <CardHeader>
          <CardTitle>今日操作备忘</CardTitle>
          <CardDescription className="text-slate-300">盘中先看风险灯，再看是否触发预案；没有触发就不动。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-100">
          <p>1. 大涨不追高，只记录减仓与锁盈条件。</p>
          <p>2. 科技仓重叠时，优先降低集中度而不是继续加码。</p>
          <p>3. 现金垫低于 10% 时，暂停新增仓位。</p>
        </CardContent>
      </Card>
      {records.map((item) => (
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

function SettingsPage({ cash, setCash, usdRate, setUsdRate }: { cash: number; setCash: (value: number) => void; usdRate: number; setUsdRate: (value: number) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>参数设置</CardTitle>
          <CardDescription>手动录入参数会即时影响总览和风险页；刷新后恢复 MVP 默认值。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="grid gap-2 text-sm font-medium">
            机动现金（人民币）
            <Input type="number" value={cash} onChange={(event) => setCash(Number(event.target.value))} />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            美股折算汇率
            <Input type="number" step="0.01" value={usdRate} onChange={(event) => setUsdRate(Number(event.target.value))} />
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />静态 MVP 说明</CardTitle>
          <CardDescription>当前版本为静态 MVP，使用模拟数据 / Mock 数据与手动参数，不连接数据库、不接真实行情 API、不包含登录。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-600">
          <p>后续可接入实时行情 API，用于刷新 A股与美股价格、涨跌幅和止损提醒。</p>
          <p>后续可接入个人持仓数据，用于同步真实仓位、现金、交易记录与风险敞口。</p>
          <p>本轮仅做 UI 微调，保持 Vercel 静态部署能力。</p>
        </CardContent>
      </Card>
    </div>
  );
}
