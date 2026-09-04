"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppState } from "@/domain/model";
import type { PortfolioMetrics } from "@/domain/engines/portfolio-risk-engine";

const colors = ["#494fdf", "#00a87e", "#8b5cf6", "#ec7e00", "#8d969e"];
const money = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${value.toFixed(1)}%`;

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section className="rounded-[24px] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-[#191c1f]"><div className="mb-4"><h2 className="text-lg font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500">{note}</p></div>{children}</section>;
}

export function LongTermInsights({ state, metrics, compact = false }: { state: AppState; metrics: PortfolioMetrics; compact?: boolean }) {
  const investedByMarket = (["CN", "US", "HK"] as const).map((market) => ({
    name: market === "CN" ? "A股" : market === "US" ? "美股" : "港股",
    value: metrics.valuations.filter((item) => item.instrument.market === market).reduce((sum, item) => sum + item.valueBase, 0),
  })).filter((item) => item.value > 0);
  const allocation = [...investedByMarket, { name: "现金", value: metrics.cashValue }].filter((item) => item.value > 0);
  const holdings = [...metrics.valuations].sort((a, b) => b.valueBase - a.valueBase).slice(0, compact ? 6 : 10).map((item) => ({
    name: item.instrument.symbol,
    fullName: item.instrument.name,
    value: item.valueBase,
    share: metrics.totalAssets ? item.valueBase / metrics.totalAssets * 100 : 0,
  })).reverse();
  const topThree = [...metrics.valuations].sort((a, b) => b.valueBase - a.valueBase).slice(0, 3);
  const currencyValues: Record<string, number> = {};
  metrics.valuations.forEach((item) => { currencyValues[item.instrument.currency] = (currencyValues[item.instrument.currency] ?? 0) + item.valueBase; });
  state.cashBalances.forEach((item) => { currencyValues[item.currency] = (currencyValues[item.currency] ?? 0) + item.amount * (state.settings.exchangeRates[item.currency] ?? 1); });
  const largestCurrency = Object.entries(currencyValues).sort((a, b) => b[1] - a[1])[0];
  const tooltipStyle = { border: "0", borderRadius: "14px", boxShadow: "0 12px 30px rgba(15,23,42,.12)" };

  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
      <ChartCard title="资产配置" note="按人民币折算市值，包括现金">
        <div className="relative h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none">{allocation.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-slate-500">总资产</span><strong className="mt-1 text-2xl font-semibold tracking-tight">{money(metrics.totalAssets)}</strong></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2">{allocation.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2 text-slate-500"><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index % colors.length] }} />{item.name}</span><b>{pct(metrics.totalAssets ? item.value / metrics.totalAssets * 100 : 0)}</b></div>)}</div>
      </ChartCard>
      <ChartCard title="持仓集中度" note={`前 ${holdings.length} 项持仓占总资产比例`}>
        <div className={compact ? "h-72" : "h-[420px]"}><ResponsiveContainer width="100%" height="100%"><BarChart data={holdings} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }}><XAxis type="number" hide domain={[0, "dataMax"]} /><YAxis type="category" dataKey="name" width={62} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8d969e" }} /><Tooltip formatter={(value, name, props) => [money(Number(props.payload.value)), `${props.payload.fullName} · ${Number(value).toFixed(1)}%`]} contentStyle={tooltipStyle} /><Bar dataKey="share" fill="#494fdf" radius={[0, 8, 8, 0]} barSize={18}><LabelList dataKey="share" position="right" formatter={(value: unknown) => `${Number(value).toFixed(1)}%`} fill="#8d969e" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>
      </ChartCard>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["前三大持仓", pct(metrics.topThreePct), topThree.map((item) => item.instrument.symbol).join(" · ") || "暂无持仓"],
        ["A股配置", pct(metrics.aSharePositionPct), `${investedByMarket.find((item) => item.name === "A股") ? "境内权益资产" : "暂无A股"}`],
        ["美股配置", pct(metrics.usPositionPct), largestCurrency?.[0] === "USD" ? "组合主要计价货币为美元" : "组合主要计价货币为人民币"],
        ["行情覆盖", `${metrics.dataConfidence}%`, metrics.dataConfidence === 100 ? "全部持仓已有可追踪行情" : "部分市值使用估算"],
      ].map(([label, value, note]) => <section key={label} className="rounded-[20px] bg-[#f0f0f2] p-5 dark:bg-white/5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></section>)}
    </div>
    {!compact && <p className="px-1 text-xs leading-5 text-slate-500">这些图表用于观察长期配置结构，不提供止损线、卖出指令或短期价格预测。市场分类依据当前持仓市场；行业标签不完整时不展示行业占比。</p>}
  </div>;
}
