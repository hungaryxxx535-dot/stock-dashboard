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
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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

const aShareHoldings: AShareHolding[] = [
  { name: "科创芯50", code: "588750", quantity: 204151, costPrice: 0.99, currentPrice: 1.25, marketValue: 255188, pnl: 53186, type: "核心仓", suggestion: "持有", note: "芯片主线底仓，仓位偏重，避免追高。" },
  { name: "科创半导", code: "588170", quantity: 236778, costPrice: 0.85, currentPrice: 0.95, marketValue: 223989, pnl: 22037, type: "核心仓", suggestion: "持有", note: "与科创芯50相关度高，合并看集中度。" },
  { name: "科创200", code: "588220", quantity: 182947, costPrice: 0.82, currentPrice: 0.88, marketValue: 161255, pnl: 11813, type: "核心仓", suggestion: "观察", note: "弹性仓，回撤时看承接。" },
  { name: "澜起科技", code: "688008", quantity: 1582, costPrice: 55.42, currentPrice: 89.43, marketValue: 141479, pnl: 53818, type: "核心仓", suggestion: "分批锁盈", note: "单票盈利丰厚，适合用移动止盈保护利润。" },
  { name: "招商银行", code: "600036", quantity: 2700, costPrice: 35.33, currentPrice: 34.93, marketValue: 94320, pnl: -1083, type: "防守仓", suggestion: "持有", note: "组合稳定器，承担防守和分红属性。" },
  { name: "通信ETF", code: "515880", quantity: 29750, costPrice: 1.09, currentPrice: 2.13, marketValue: 63279, pnl: 30990, type: "趋势仓", suggestion: "分批锁盈", note: "趋势强但浮盈大，回落破位减。" },
  { name: "AI创业板", code: "159381", quantity: 46244, costPrice: 0.94, currentPrice: 1.12, marketValue: 51744, pnl: 8269, type: "趋势仓", suggestion: "观察", note: "AI弹性补充，控制节奏。" },
  { name: "胜宏科技", code: "300476", quantity: 188, costPrice: 110.61, currentPrice: 167.20, marketValue: 31433, pnl: 10639, type: "趋势仓", suggestion: "分批锁盈", note: "PCB强趋势小仓，保留弹性。" },
  { name: "金ETF", code: "518880", quantity: 2632, costPrice: 3.41, currentPrice: 6.23, marketValue: 16386, pnl: 7416, type: "防守仓", suggestion: "持有", note: "风险对冲资产，不追涨。" },
];

const usHoldings: UsHolding[] = [
  { name: "Meta Platforms", code: "META", quantity: 24, costPrice: 472, currentPrice: 607.75, marketValue: 14586, pnl: 3258, stopLoss: 540, targetPrice: 680, trend: "上升趋势，核心持有", type: "核心仓", note: "美股核心锚。" },
  { name: "腾讯音乐", code: "TME", quantity: 500, costPrice: 7.62, currentPrice: 9.04, marketValue: 4522, pnl: 712, stopLoss: 8.1, targetPrice: 10.8, trend: "温和上行", type: "中概仓", note: "中概仓位，关注汇率和监管情绪。" },
  { name: "Amphenol", code: "APH", quantity: 23, costPrice: 118.2, currentPrice: 144.30, marketValue: 3319, pnl: 600, stopLoss: 128, targetPrice: 158, trend: "核心趋势", type: "核心仓", note: "连接器龙头，偏稳。" },
  { name: "AMD", code: "AMD", quantity: 8, costPrice: 286, currentPrice: 351.63, marketValue: 2813, pnl: 525, stopLoss: 315, targetPrice: 395, trend: "高波动趋势", type: "趋势仓", note: "AI芯片弹性仓，避免放大亏损。" },
  { name: "Rambus", code: "RMBS", quantity: 11, costPrice: 91, currentPrice: 111, marketValue: 1221, pnl: 220, stopLoss: 98, targetPrice: 128, trend: "观察上行", type: "观察仓", note: "小仓观察。" },
  { name: "Direxion MSFT 2X", code: "MSFU", quantity: 23, costPrice: 23, currentPrice: 27.91, marketValue: 642, pnl: 113, stopLoss: 24.5, targetPrice: 32, trend: "杠杆仓，高风险", type: "杠杆仓", note: "严格小仓，不能补跌。" },
  { name: "拼多多", code: "PDD", quantity: 4, costPrice: 86, currentPrice: 98.75, marketValue: 395, pnl: 51, stopLoss: 88, targetPrice: 118, trend: "观察修复", type: "观察仓", note: "中概小仓观察。" },
  { name: "Intel", code: "INTC", quantity: 4, costPrice: 78, currentPrice: 98.75, marketValue: 395, pnl: 83, stopLoss: 86, targetPrice: 115, trend: "剩余趋势仓", type: "趋势仓", note: "已减半，剩余小仓趋势仓。" },
];

const records = [
  { date: "2026-05-06", market: "A股", symbol: "澜起科技", action: "卖出计划", reason: "浮盈较大，防单票回撤", result: "触发冲高分批锁盈，不追求卖在最高点。" },
  { date: "2026-05-06", market: "A股", symbol: "科创芯片组合", action: "不动", reason: "科技集中度已高", result: "等待回撤或放量突破后再评估。" },
  { date: "2026-05-06", market: "美股", symbol: "META / APH", action: "持有", reason: "核心仓趋势仍在", result: "以止损线保护，不主动加杠杆。" },
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

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [cash, setCash] = useState(180000);
  const [usdRate, setUsdRate] = useState(7.2);

  const totals = useMemo(() => {
    const aShareValue = aShareHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const aSharePnl = aShareHoldings.reduce((sum, item) => sum + item.pnl, 0);
    const usValueUsd = usHoldings.reduce((sum, item) => sum + item.marketValue, 0);
    const usPnlUsd = usHoldings.reduce((sum, item) => sum + item.pnl, 0);
    const usValueCny = usValueUsd * usdRate;
    const totalAssets = aShareValue + usValueCny + cash;
    const stockPosition = ((aShareValue + usValueCny) / totalAssets) * 100;
    const techValue = aShareHoldings
      .filter((item) => ["科创芯50", "科创半导", "科创200", "澜起科技", "通信ETF", "AI创业板", "胜宏科技"].includes(item.name))
      .reduce((sum, item) => sum + item.marketValue, 0) + usHoldings.filter((item) => ["META", "APH", "AMD", "RMBS", "MSFU", "INTC"].includes(item.code)).reduce((sum, item) => sum + item.marketValue * usdRate, 0);
    const techConcentration = (techValue / totalAssets) * 100;
    const maxHolding = Math.max(...aShareHoldings.map((item) => item.marketValue), ...usHoldings.map((item) => item.marketValue * usdRate));
    const maxHoldingPct = (maxHolding / totalAssets) * 100;
    return { aShareValue, aSharePnl, usValueUsd, usValueCny, usPnlUsd, totalAssets, stockPosition, techConcentration, maxHoldingPct };
  }, [cash, usdRate]);

  const riskLevel = totals.stockPosition > 88 || totals.techConcentration > 72 || totals.maxHoldingPct > 16 ? "红灯" : totals.stockPosition > 78 || totals.techConcentration > 62 || cash / totals.totalAssets < 0.1 ? "黄灯" : "绿灯";
  const todayCommand = riskLevel === "红灯" ? "先减仓降集中度，不加仓" : riskLevel === "黄灯" ? "不追高，只做分批锁盈" : "可小额加仓候选，但保留现金垫";

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-slate-50 pb-28 text-slate-950 md:pb-8">
      <header className="sticky top-0 z-20 border-b bg-slate-50/90 px-4 py-3 backdrop-blur md:rounded-b-3xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Mobile-first PWA MVP</p>
            <h1 className="text-xl font-black tracking-tight">非哥股票作战台</h1>
            <p className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-1 text-[11px] font-bold text-orange-700">模拟数据 · 静态持仓 · 手动参数</p>
          </div>
          <RiskLamp level={riskLevel} />
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto md:hidden">
          {tabs.map((tab) => <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />)}
        </div>
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-[180px_1fr]">
        <aside className="sticky top-24 hidden h-fit rounded-3xl border bg-white p-2 shadow-sm md:block">
          {tabs.map((tab) => <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} desktop />)}
        </aside>
        <motion.section key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {activeTab === "overview" && <Overview totals={totals} cash={cash} riskLevel={riskLevel} todayCommand={todayCommand} />}
          {activeTab === "a-share" && <ASharePage totalAssets={totals.totalAssets} />}
          {activeTab === "us" && <UsPage totalAssets={totals.totalAssets} usdRate={usdRate} />}
          {activeTab === "risk" && <RiskPage totals={totals} cash={cash} todayCommand={todayCommand} />}
          {activeTab === "records" && <RecordsPage />}
          {activeTab === "settings" && <SettingsPage cash={cash} setCash={setCash} usdRate={usdRate} setUsdRate={setUsdRate} />}
        </motion.section>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={cn("flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium text-slate-500", activeTab === id && "bg-slate-900 text-white")}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

function TabButton({ tab, active, onClick, desktop = false }: { tab: { label: string; icon: ElementType }; active: boolean; onClick: () => void; desktop?: boolean }) {
  const Icon = tab.icon;
  return <Button variant={active ? "default" : "secondary"} onClick={onClick} className={cn("shrink-0 gap-2", desktop && "mb-1 w-full justify-start rounded-2xl") }><Icon className="h-4 w-4" />{tab.label}</Button>;
}

function RiskLamp({ level }: { level: string }) {
  const color = level === "红灯" ? "bg-red-500" : level === "黄灯" ? "bg-amber-400" : "bg-emerald-500";
  return <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-bold shadow-sm"><span className={cn("h-3 w-3 rounded-full shadow", color)} />风险{level}</div>;
}

function Overview({ totals, cash, riskLevel, todayCommand }: { totals: PortfolioTotals; cash: number; riskLevel: string; todayCommand: string }) {
  const allocation = [
    { name: "A股", value: totals.aShareValue, color: "#2563eb" },
    { name: "美股折算", value: totals.usValueCny, color: "#7c3aed" },
    { name: "现金", value: cash, color: "#10b981" },
  ];
  return <div className="space-y-4">
    <Card className="overflow-hidden border-slate-900 bg-slate-950 text-white">
      <CardHeader>
        <CardDescription className="text-slate-300">今日总指令</CardDescription>
        <CardTitle className="text-2xl leading-tight">{todayCommand}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <MiniMetric label="总仓位" value={formatPct(totals.stockPosition)} />
        <MiniMetric label="风险灯" value={riskLevel} />
        <MiniMetric label="科技集中度" value={formatPct(totals.techConcentration)} />
        <MiniMetric label="现金垫" value={formatCny(cash)} />
      </CardContent>
    </Card>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard icon={Landmark} label="A股持仓市值" value={formatCny(totals.aShareValue)} sub={`浮盈 ${formatCny(totals.aSharePnl)}`} />
      <MetricCard icon={CircleDollarSign} label="美股持仓市值" value={formatUsd(totals.usValueUsd)} sub={`折算 ${formatCny(totals.usValueCny)}`} />
      <MetricCard icon={Banknote} label="机动现金" value={formatCny(cash)} sub="可在设置中修改" />
      <MetricCard icon={Gauge} label="总资产估算" value={formatCny(totals.totalAssets)} sub="静态数据 + 手动参数" />
    </div>
    <Card>
      <CardHeader><CardTitle>资产作战地图</CardTitle><CardDescription>一眼看出股票、现金和市场分布。</CardDescription></CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4}>{allocation.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value: unknown) => formatCny(Number(value))} /></PieChart></ResponsiveContainer>
      </CardContent>
    </Card>
  </div>;
}


function MetricCard({ icon: Icon, label, value, sub }: { icon: ElementType; label: string; value: string; sub: string }) {
  return <Card><CardContent className="p-4"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100"><Icon className="h-5 w-5" /></div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></CardContent></Card>;
}
function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-slate-300">{label}</p><p className="mt-1 font-black">{value}</p></div>; }

function ASharePage({ totalAssets }: { totalAssets: number }) { return <Holdings title="A股持仓" description="字段含数量、成本、现价、市值、浮盈亏、仓位、类型、建议和备注。">{aShareHoldings.map((item) => <HoldingCard key={item.code} title={item.name} code={item.code} value={formatCny(item.marketValue)} pnl={item.pnl} position={item.marketValue / totalAssets * 100} badges={[item.type, item.suggestion]} rows={[['持仓数量', item.quantity.toLocaleString('zh-CN')], ['成本价', item.costPrice.toFixed(2)], ['现价', item.currentPrice.toFixed(2)], ['备注', item.note]]} />)}</Holdings>; }
function UsPage({ totalAssets, usdRate }: { totalAssets: number; usdRate: number }) { return <Holdings title="美股持仓" description="美元静态示例数据，仓位按设置中的汇率折算成人民币计算。">{usHoldings.map((item) => <HoldingCard key={item.code} title={item.name} code={item.code} value={formatUsd(item.marketValue)} pnl={item.pnl} position={item.marketValue * usdRate / totalAssets * 100} badges={[item.type, item.trend]} rows={[['持仓数量', `${item.quantity} 股`], ['成本价', `$${item.costPrice.toFixed(2)}`], ['现价', `$${item.currentPrice.toFixed(2)}`], ['止损价', `$${item.stopLoss.toFixed(2)}`], ['目标价', `$${item.targetPrice.toFixed(2)}`], ['备注', item.note]]} />)}</Holdings>; }
function Holdings({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <div className="space-y-3"><div><h2 className="text-2xl font-black">{title}</h2><p className="text-sm text-slate-500">{description}</p></div><div className="grid gap-3 lg:grid-cols-2">{children}</div></div>; }
function HoldingCard({ title, code, value, pnl, position, badges, rows }: { title: string; code: string; value: string; pnl: number; position: number; badges: string[]; rows: [string, string][] }) { const positive = pnl >= 0; return <Card><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">{title}</h3><p className="text-sm text-slate-500">{code}</p></div><div className="text-right"><p className="font-black">{value}</p><p className={cn("text-sm font-bold", positive ? "text-red-600" : "text-emerald-600")}>{positive ? "+" : ""}{pnl.toLocaleString("zh-CN")}</p></div></div><div className="my-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-900" style={{ width: `${Math.min(position * 4, 100)}%` }} /></div><div className="mb-3 flex flex-wrap gap-2"><Badge variant="secondary">仓位 {formatPct(position)}</Badge>{badges.map((badge) => <Badge key={badge} variant={badge.includes("锁盈") || badge.includes("风险") ? "warning" : "outline"}>{badge}</Badge>)}</div><div className="grid gap-2 text-sm">{rows.map(([label, val]) => <div key={label} className="flex justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2"><span className="shrink-0 text-slate-500">{label}</span><span className="text-right font-medium">{val}</span></div>)}</div></CardContent></Card>; }

function RiskPage({ totals, cash, todayCommand }: { totals: PortfolioTotals; cash: number; todayCommand: string }) { const items = [{ label: "整体股票仓位", value: formatPct(totals.stockPosition), danger: totals.stockPosition > 78, note: "超过 80% 不宜追高加仓。" }, { label: "科创/科技集中度", value: formatPct(totals.techConcentration), danger: totals.techConcentration > 62, note: "芯片、AI、通信、美股科技相关度高。" }, { label: "单票集中风险", value: formatPct(totals.maxHoldingPct), danger: totals.maxHoldingPct > 16, note: "单一标的过大时优先锁盈。" }, { label: "现金垫是否充足", value: formatPct(cash / totals.totalAssets * 100), danger: cash / totals.totalAssets < 0.1, note: "现金不足会降低应对回撤能力。" }]; return <div className="space-y-4"><Card className="border-amber-200 bg-amber-50"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />今日是否适合操作</CardTitle><CardDescription className="text-amber-800">{todayCommand}</CardDescription></CardHeader></Card><div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Card key={item.label}><CardContent className="p-4"><div className="flex items-center justify-between"><p className="font-bold">{item.label}</p><Badge variant={item.danger ? "warning" : "success"}>{item.danger ? "需警惕" : "可接受"}</Badge></div><p className="mt-3 text-2xl font-black">{item.value}</p><p className="mt-1 text-sm text-slate-500">{item.note}</p></CardContent></Card>)}</div></div>; }
function RecordsPage() { return <div className="space-y-3"><div><h2 className="text-2xl font-black">操作记录</h2><p className="text-sm text-slate-500">用于记录买卖原因和结果复盘，MVP 先使用静态数据。</p></div>{records.map((item) => <Card key={`${item.date}-${item.symbol}`}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-slate-500">{item.date} · {item.market}</p><h3 className="text-lg font-black">{item.symbol}</h3></div><Badge>{item.action}</Badge></div><div className="mt-3 grid gap-2 text-sm"><p><span className="text-slate-500">操作原因：</span>{item.reason}</p><p><span className="text-slate-500">结果复盘：</span>{item.result}</p></div></CardContent></Card>)}</div>; }
function SettingsPage({ cash, setCash, usdRate, setUsdRate }: { cash: number; setCash: (value: number) => void; usdRate: number; setUsdRate: (value: number) => void }) { return <div className="space-y-4"><Card><CardHeader><CardTitle>参数设置</CardTitle><CardDescription>手动录入参数会即时影响总览和风险页；刷新后恢复 MVP 默认值。</CardDescription></CardHeader><CardContent className="space-y-4"><label className="grid gap-2 text-sm font-medium">机动现金（人民币）<Input type="number" value={cash} onChange={(event: { target: { value: string } }) => setCash(Number(event.target.value))} /></label><label className="grid gap-2 text-sm font-medium">美股折算汇率<Input type="number" step="0.01" value={usdRate} onChange={(event: { target: { value: string } }) => setUsdRate(Number(event.target.value))} /></label></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />预留行情 API 接口</CardTitle><CardDescription>后续可接入券商、聚合行情或自建接口，当前版本仅使用模拟数据、静态持仓和手动参数。</CardDescription></CardHeader><CardContent className="grid gap-2 text-sm text-slate-600"><p>GET /api/quotes/a-share?symbols=...</p><p>GET /api/quotes/us?symbols=...</p><p>POST /api/portfolio/sync</p></CardContent></Card></div>; }
