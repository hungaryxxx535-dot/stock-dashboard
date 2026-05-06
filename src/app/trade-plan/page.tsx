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
const formatAmount = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;

export default function TradePlanPage() {
  const [tradePlan, setTradePlan] = useState<TradePlan>(defaultTradePlan);

  const lq = findAShare("688008");
  const kcChip = findAShare("588750");
  const amd = findUs("AMD");
  const anet = findUs("ANET");

  const cashTargetAmount = accountSnapshot.aShare.totalAssets * (tradePlan.cashTargetPct / 100);
  const cashGap = Math.max(0, cashTargetAmount - accountSnapshot.aShare.availableCash);
  const currentAccountCashPct = (accountSnapshot.aShare.availableCash / accountSnapshot.aShare.totalAssets) * 100;

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
    {
      title: "强势上冲",
      badge: "不追",
      text: "科创、半导体、AMD 继续冲高时，不新增同方向仓位。只做两件事：上移止盈线，挑浮盈大的仓位分批锁一点。",
    },
    {
      title: "正常震荡",
      badge: "等待",
      text: "价格没有触发操作线时，不为了操作而操作。重点看科创芯50和澜起是否稳住，ANET 是否继续弱。",
    },
    {
      title: "放量回撤",
      badge: "执行",
      text: "优先处理新仓浮亏和高相关仓位：ANET 看止损，澜起/AMD 看移动止盈，科创系看是否需要合并降低集中度。",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">手动操作线设置</h1>
              <Badge variant="warning">阶段4 深化版</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">独立页面 · 临时参数 · 不自动交易 · 不接实时行情</p>
          </div>
          <a className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50" href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />今日执行原则</CardTitle>
            <CardDescription className="text-slate-300">这些线只是提醒，不会自动买卖；真正下单仍要结合实时盘面。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-100">
            <p>1. 大涨后不追高，先看是否要锁盈。</p>
            <p>2. 跌破操作线不是机械卖出，而是触发复核。</p>
            <p>3. 新仓浮亏票优先讲纪律，老仓浮盈票优先讲保护。</p>
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
                  <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700">
                    触发后动作：{item.action}
                  </div>
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
