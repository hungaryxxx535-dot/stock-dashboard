"use client";

import { useMemo, useState } from "react";
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

const defaultTradePlan: TradePlan = {
  lqTechTrailingStop: 185,
  kcChipWatchPrice: 2.05,
  amdTrailingStop: 380,
  anetStopLoss: 150,
  cashTargetPct: 20,
};

const findAShare = (code: string) => aShareHoldings.find((item) => item.code === code);
const findUs = (code: string) => usHoldings.find((item) => item.code === code);

const formatPct = (value: number) => `${value.toFixed(1)}%`;
const formatCny = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const formatUsd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

export default function TradePlanPage() {
  const [tradePlan, setTradePlan] = useState<TradePlan>(defaultTradePlan);

  const lq = findAShare("688008");
  const kcChip = findAShare("588750");
  const amd = findUs("AMD");
  const anet = findUs("ANET");

  const planRows = useMemo(() => {
    return [
      {
        name: "澜起科技移动止盈线",
        current: lq?.currentPrice ?? 0,
        line: tradePlan.lqTechTrailingStop,
        unit: "cny" as const,
        note: "浮盈核心仓，跌破操作线后重点复核是否分批锁盈。",
      },
      {
        name: "科创芯50观察位",
        current: kcChip?.currentPrice ?? 0,
        line: tradePlan.kcChipWatchPrice,
        unit: "cny" as const,
        note: "第一大仓，靠近观察位时看承接，不盲目加仓。",
      },
      {
        name: "AMD 移动止盈线",
        current: amd?.currentPrice ?? 0,
        line: tradePlan.amdTrailingStop,
        unit: "usd" as const,
        note: "强势贡献仓，跌破移动止盈线后复核是否锁利润。",
      },
      {
        name: "ANET 止损线",
        current: anet?.currentPrice ?? 0,
        line: tradePlan.anetStopLoss,
        unit: "usd" as const,
        note: "新仓浮亏，跌破止损线优先执行风控。",
      },
    ];
  }, [tradePlan, lq, kcChip, amd, anet]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">手动操作线设置</h1>
              <Badge variant="warning">阶段4</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">独立页面 · 临时参数 · 不自动交易 · 不接实时行情</p>
          </div>
          <a className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50" href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />今日使用原则</CardTitle>
            <CardDescription className="text-slate-300">这些线只是提醒，不会自动买卖；真正下单仍要结合实时盘面。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-100">
            <p>1. 大涨后不追高，先看是否要锁盈。</p>
            <p>2. 跌破操作线不是机械卖出，而是触发复核。</p>
            <p>3. ANET 这种新仓浮亏票，纪律要比想象更重要。</p>
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
            <CardDescription>当前价格来自静态持仓数据，不是实时行情。页面刷新后，手动输入会恢复默认值。</CardDescription>
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
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />仓位提醒</CardTitle>
            <CardDescription>这部分读取最新 portfolio.ts 的静态账户信息。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-700">
            <p><span className="font-bold text-slate-900">A股券商账户仓位：</span>{formatPct(accountSnapshot.aShare.brokerPositionPct)}</p>
            <p><span className="font-bold text-slate-900">场外机动资金：</span>约 {(accountSnapshot.aShare.offsiteCash / 10000).toFixed(0)} 万元</p>
            <p><span className="font-bold text-slate-900">目标现金比例：</span>{formatPct(tradePlan.cashTargetPct)}</p>
            <p><span className="font-bold text-slate-900">数据版本：</span>{dataVersion.aShare}；{dataVersion.us}</p>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-blue-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />下一步</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">
            这个独立页面确认没问题后，再把它整合进主看板底部导航或设置页。当前先保证不破坏已上线的主页面。
          </CardContent>
        </Card>
      </div>
    </main>
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
