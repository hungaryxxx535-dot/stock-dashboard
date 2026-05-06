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
import {
  aShareHoldings,
  accountSnapshot,
  dataVersion,
  operationRecords,
  portfolioParams,
  settingsNotes,
  usHoldings,
} from "@/data/portfolio";
import type { AShareHolding, Suggestion, UsHolding } from "@/data/portfolio";
import { cn } from "@/lib/utils";

type TabId = "overview" | "a-share" | "us" | "risk" | "records" | "settings";

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
  { id: "risk", label: "风险", icon: ShieldAlert },
  { id: "records", label: "记录", icon: BookOpenCheck },
  { id: "settings", label: "设置", icon: Settings },
];

const formatCny = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const formatUsd = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const formatPct = (value: number) => `${value.toFixed(1)}%`;

export default function StockDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [cash, setCash] = useState(portfolioParams.cash);
  const [usdRate, setUsdRate] = useState(portfolioParams.usdRate);

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
  const riskLight = totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow || totals.stockPosition > portfolioParams.riskThresholds.stockPositionYellow ? "黄灯" : "绿灯";
  const todayCommand = riskLight === portfolioParams.riskLight ? portfolioParams.todayCommand : "今日总指令：按计划持有，等待更高胜率信号。";

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
  const reviewItems = [
    `券商账户仓位 ${accountSnapshot.aShare.brokerPositionPct.toFixed(1)}%，是否需要防回撤`,
    "科创芯50、科创半导、科创200、澜起科技合计仓位偏高，是否需要分批锁盈",
    "美股 ANET 新仓浮亏，AMD 大涨，是否需要分别设置止损 / 移动止盈",
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

      <Card className="border-blue-100 bg-blue-50/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />数据状态</CardTitle>
          <CardDescription>当前网页只做持仓和风险框架参考，买卖判断必须结合实时盘面。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-700">
          <p><span className="font-bold text-slate-900">A股：</span>{dataVersion.aShare}</p>
          <p><span className="font-bold text-slate-900">美股：</span>{dataVersion.us}</p>
          <p><span className="font-bold text-slate-900">状态：</span>静态持仓，不是实时行情。</p>
          <p><span className="font-bold text-slate-900">提醒：</span>{dataVersion.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>今日复核清单</CardTitle>
          <CardDescription>每天打开作战台，先看这三件事，再决定是否操作。</CardDescription>
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
    { label: "科创/科技集中度", value: formatPct(totals.techConcentration), danger: totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow, note: "芯片、AI、通信、美股科技相关度高。" },
    { label: "单票集中风险", value: formatPct(totals.maxHoldingPct), danger: totals.maxHoldingPct > 16, note: "单一标的过大时优先锁盈。" },
    { label: "现金垫是否充足", value: formatPct(cashPct), danger: cashPct < portfolioParams.riskThresholds.cashPctWarning, note: "现金不足会降低应对回撤能力。" },
  ];
  const checks: RiskCheck[] = [
    { title: "科技仓位是否过高", status: totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow ? "警惕" : "观察", danger: totals.techConcentration > portfolioParams.riskThresholds.techConcentrationYellow, description: "科创、AI、通信与美股科技相关性高，集中度过高时不再叠加同方向仓位。" },
    { title: "单日大涨后是否追高", status: "执行", danger: true, description: "大涨日只更新止盈线与减仓计划，不做情绪化追单。" },
    { title: "是否需要减仓降低集中度", status: totals.stockPosition > 78 ? "执行" : "观察", danger: totals.stockPosition > 78, description: "优先从浮盈较大、相关性重叠的科技仓中分批降低集中度。" },
  ];
  const watchList = [
    "科创芯50：第一大仓，冲高不追",
    "澜起科技：浮盈大，适合移动止盈",
    "科创半导：与科创芯50高度相关",
    "科创200：弹性仓，看回撤承接",
    "AMD：强势贡献仓，看移动止盈",
    "ANET：新仓浮亏，看止损线",
    "META：美股第一大仓，看单票集中风险",
  ];

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />当前风险结论</CardTitle>
          <CardDescription className="text-amber-800">{todayCommand}</CardDescription>
          <p className="text-sm text-amber-800">当前不是满仓口径，但券商账户仓位已经达到 {accountSnapshot.aShare.brokerPositionPct.toFixed(1)}%，A股核心风险来自科创、半导体、AI 方向高度集中。今日大涨后不宜追高，优先做锁盈和仓位保护。</p>
          <p className="text-sm text-amber-800">券商账户仓位高，但整体资金口径不是满仓，场外有约{(accountSnapshot.aShare.offsiteCash / 10000).toFixed(0)}万机动资金。</p>
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
          <CardTitle>重点盯盘对象</CardTitle>
          <CardDescription>这些是当前组合里最容易影响账户波动的核心点。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {watchList.map((item) => (
            <div key={item} className="rounded-2xl bg-slate-50 p-3 font-medium text-slate-700">{item}</div>
          ))}
        </CardContent>
      </Card>
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
  const updateFlow = [
    "收盘后上传 A股持仓截图",
    "美股盘后或北京时间早上上传美股持仓截图",
    "更新 src/data/portfolio.ts",
    "检查 A股代码、数量、成本、现价、盈亏",
    "检查美股新增 / 减仓标的",
    "合并或直接提交",
    "等 Vercel 自动部署",
    "刷新网页验收数据版本",
  ];

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
      <Card>
        <CardHeader>
          <CardTitle>每日更新流程</CardTitle>
          <CardDescription>后续每次更新持仓，都按这个顺序验收，避免旧数据混进网页。</CardDescription>
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

function SettingsPage({ cash, setCash, usdRate, setUsdRate }: { cash: number; setCash: (value: number) => void; usdRate: number; setUsdRate: (value: number) => void }) {
  const roadmap = [
    ["阶段1", "静态持仓展示", "已完成"],
    ["阶段2", "持仓数据配置化", "已完成"],
    ["阶段3", "每日更新流程化", "当前阶段"],
    ["阶段4", "手动表格导入", "待做"],
    ["阶段5", "接入实时行情 API", "待做"],
    ["阶段6", "接入 Gmail / 扣子日报同步", "待做"],
    ["阶段7", "增加风险提醒推送", "待做"],
  ];

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
        <CardContent className="grid gap-3 text-sm text-slate-600">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-bold text-slate-900">数据版本</p>
            <p>A股：{dataVersion.aShare}</p>
            <p>美股：{dataVersion.us}</p>
            <p>{dataVersion.description}</p>
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
          <CardDescription>先把静态更新流程跑顺，再考虑接入真实行情和自动化。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {roadmap.map(([stage, title, status]) => (
            <div key={stage} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="font-bold text-slate-900">{stage}：{title}</p>
              </div>
              <Badge variant={status === "当前阶段" ? "warning" : status === "已完成" ? "success" : "outline"}>{status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
