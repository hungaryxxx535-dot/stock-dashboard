"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, BrainCircuit, Globe2, Newspaper, RefreshCw, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UsHoldingDecision, UsMacroIndicator, UsMarketIntelligence, UsNewsItem } from "@/lib/us-intelligence/types";
import { cn } from "@/lib/utils";

const emptyData: UsMarketIntelligence = {
  generatedAt: "",
  tradingDate: "",
  quoteStatus: "waiting",
  quoteSource: "",
  regime: { label: "数据不足", score: null, confidence: 0, reasons: [], actionBias: "等待数据。" },
  benchmarks: [],
  macro: [],
  news: [],
  holdings: [],
  portfolio: { totalValue: 0, weightedChangePct: null, top1Weight: 0, top3Weight: 0, positiveCount: 0, negativeCount: 0, aiInfrastructureWeight: 0, chinaAdrWeight: 0, leveragedWeight: 0 },
  conclusions: [],
  warnings: [],
};

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function formatTime(value: string) {
  if (!value) return "未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function signalVariant(signal: UsHoldingDecision["signal"]): "success" | "warning" | "destructive" | "secondary" | "outline" {
  if (signal === "进攻候选") return "success";
  if (signal === "减仓复核") return "warning";
  if (signal === "严格风控") return "destructive";
  if (signal === "持有观察") return "secondary";
  return "outline";
}

function impactVariant(impact: UsNewsItem["impact"]): "success" | "warning" | "outline" | "secondary" {
  if (impact === "利多") return "success";
  if (impact === "利空") return "warning";
  if (impact === "中性") return "secondary";
  return "outline";
}

export default function UsAnalysisPage() {
  const [data, setData] = useState<UsMarketIntelligence>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [category, setCategory] = useState<UsNewsItem["category"] | "全部">("全部");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/us-intelligence?t=${Date.now()}`, { cache: "no-store" });
      const payload = (await response.json()) as UsMarketIntelligence;
      if (!response.ok) throw new Error(payload.warnings?.[0] || "美股投研接口失败");
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "美股投研读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = data.holdings.find((item) => item.symbol === selectedSymbol) ?? data.holdings[0];
  const categories = useMemo(() => ["全部", ...new Set(data.news.map((item) => item.category))] as const, [data.news]);
  const filteredNews = category === "全部" ? data.news : data.news.filter((item) => item.category === category);
  const selectedNews = selected ? data.news.filter((item) => item.relatedSymbols.includes(selected.symbol)).slice(0, 5) : [];

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 lg:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />返回作战台</a>
            <h1 className="text-2xl font-black sm:text-3xl">美股多维投研</h1>
            <p className="mt-1 text-sm text-slate-500">结合美股指数、利率、波动率、信用环境、新闻和你的实际持仓。</p>
          </div>
          <Button onClick={() => void load()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />刷新分析</Button>
        </header>

        {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

        <Card className={cn("border-none text-white", data.regime.label === "风险偏好改善" ? "bg-emerald-700" : data.regime.label === "风险偏好收缩" ? "bg-rose-700" : "bg-slate-950")}>
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold text-white/70">当前美股环境</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <p className="text-4xl font-black">{loading ? "读取中" : data.regime.label}</p>
                <p className="pb-1 text-sm text-white/70">置信度 {data.regime.confidence}%</p>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85">{data.regime.actionBias}</p>
              <p className="mt-2 text-xs text-white/60">收盘数据：{data.tradingDate || "待更新"} · {data.quoteSource || "未知来源"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm lg:w-80">
              <DarkKpi label="环境评分" value={data.regime.score === null ? "—" : String(data.regime.score)} />
              <DarkKpi label="持仓加权涨跌" value={pct(data.portfolio.weightedChangePct)} />
              <DarkKpi label="第一大仓" value={`${data.portfolio.top1Weight.toFixed(1)}%`} />
              <DarkKpi label="AI基础设施敞口" value={`${data.portfolio.aiInfrastructureWeight.toFixed(1)}%`} />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />综合判断依据</CardTitle><CardDescription>市场趋势、利率、波动率、信用利差、持仓表现和新闻共同参与。</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {data.regime.reasons.length ? data.regime.reasons.map((item, index) => <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge><p className="text-sm leading-6 text-slate-700">{item}</p></div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">尚未形成足够的外部证据链。</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />账户级结论</CardTitle><CardDescription>把宏观判断转化为你的实际持仓动作框架。</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {data.conclusions.map((item, index) => <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><Badge variant={index === 0 ? "warning" : "secondary"} className="h-fit shrink-0">{index + 1}</Badge><p className="text-sm leading-6 text-slate-700">{item}</p></div>)}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />美股主要指数趋势</CardTitle><CardDescription>使用FRED官方公开序列计算最近一日和约20个交易日趋势。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {data.benchmarks.length ? data.benchmarks.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-black">{item.name}</p><p className="mt-2 text-2xl font-black">{item.value?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ?? "—"}</p><div className="mt-3 grid grid-cols-2 gap-2"><MiniKpi label="1日" value={pct(item.change1d)} /><MiniKpi label="20日" value={pct(item.change20d)} /></div><p className="mt-2 text-xs text-slate-400">{item.date} · {item.source}</p></div>) : <p className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">指数数据暂不可用。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" />美国宏观与流动性</CardTitle><CardDescription>重点跟踪科技股最敏感的利率、VIX、信用利差、通胀和就业。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.macro.map((item) => <MacroCard key={item.id} item={item} />)}
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="美股持仓估值" value={usd(data.portfolio.totalValue)} hint={`上涨${data.portfolio.positiveCount}只 / 下跌${data.portfolio.negativeCount}只`} />
          <Summary label="前三大持仓" value={`${data.portfolio.top3Weight.toFixed(1)}%`} hint="衡量账户对少数股票的依赖" warning={data.portfolio.top3Weight > 70} />
          <Summary label="中概股权重" value={`${data.portfolio.chinaAdrWeight.toFixed(1)}%`} hint="PDD与TME合计" />
          <Summary label="杠杆仓权重" value={`${data.portfolio.leveragedWeight.toFixed(1)}%`} hint="环境收缩时优先控制" warning={data.portfolio.leveragedWeight > 5} />
        </section>

        <Card>
          <CardHeader><CardTitle>持仓决策矩阵</CardTitle><CardDescription>先看价格与纪律线，再叠加宏观和新闻；不是自动下单指令。</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <div className="grid max-h-[620px] gap-2 overflow-auto pr-1">
              {data.holdings.map((item) => <button key={item.symbol} type="button" onClick={() => setSelectedSymbol(item.symbol)} className={cn("rounded-2xl border p-3 text-left transition", selected?.symbol === item.symbol ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:bg-slate-50")}><div className="flex items-center justify-between gap-2"><p className="font-black">{item.symbol} · {item.name}</p><Badge variant={signalVariant(item.signal)}>{item.signal}</Badge></div><p className={cn("mt-1 text-xs", selected?.symbol === item.symbol ? "text-slate-300" : "text-slate-400")}>{item.sector} · 权重 {item.portfolioWeight.toFixed(1)}%</p></button>)}
            </div>
            {selected && <div className="space-y-4 rounded-3xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-2xl font-black">{selected.symbol} · {selected.name}</h3><p className="text-sm text-slate-500">{selected.sector}</p></div><Badge variant={signalVariant(selected.signal)}>{selected.signal}</Badge></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniKpi label="收盘价" value={selected.close === null ? "—" : `$${selected.close.toFixed(2)}`} /><MiniKpi label="当日涨跌" value={pct(selected.changePct)} /><MiniKpi label="持仓权重" value={`${selected.portfolioWeight.toFixed(1)}%`} /><MiniKpi label="新闻条数" value={String(selected.newsCount)} /></div><div className="grid gap-2 sm:grid-cols-2"><MiniKpi label="距离止损线" value={pct(selected.distanceToStopPct)} /><MiniKpi label="距离目标价" value={pct(selected.distanceToTargetPct)} /></div><div className="rounded-2xl bg-white p-4"><p className="text-sm font-black">判断逻辑</p>{selected.rationale.map((item) => <p key={item} className="mt-2 text-sm leading-6 text-slate-600">• {item}</p>)}</div><div><p className="text-sm font-black">核心敏感因素</p><div className="mt-2 flex flex-wrap gap-2">{selected.sensitivity.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div></div><div><p className="text-sm font-black">直接相关新闻</p><div className="mt-2 space-y-2">{selectedNews.length ? selectedNews.map((item) => <NewsCard key={item.id} item={item} compact />) : <p className="rounded-2xl bg-white p-3 text-sm text-slate-500">过去24小时未识别到直接相关新闻。</p>}</div></div></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Newspaper className="h-5 w-5" />过去24小时美股新闻</CardTitle><CardDescription>利多/利空为关键词初筛，点击原文核验，不把标题情绪直接等同于投资结论。</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-bold", category === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600")}>{item}</button>)}</div>
            <div className="grid gap-3 lg:grid-cols-2">{filteredNews.length ? filteredNews.slice(0, 30).map((item) => <NewsCard key={item.id} item={item} />) : <p className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">过去24小时未获得相关新闻。</p>}</div>
          </CardContent>
        </Card>

        {data.warnings.length > 0 && <Card className="border-amber-200 bg-amber-50"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-900"><ShieldAlert className="h-5 w-5" />数据警告</CardTitle></CardHeader><CardContent className="space-y-2">{data.warnings.map((item) => <p key={item} className="text-sm leading-6 text-amber-800">• {item}</p>)}</CardContent></Card>}
        <p className="text-center text-xs text-slate-400">最后聚合时间：{formatTime(data.generatedAt)}</p>
      </div>
    </main>
  );
}

function DarkKpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-white/65">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  const positive = value.startsWith("+");
  const negative = value.startsWith("-");
  return <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200/70"><p className="text-xs text-slate-400">{label}</p><p className={cn("mt-1 font-black", positive ? "text-red-600" : negative ? "text-emerald-700" : "text-slate-950")}>{value}</p></div>;
}

function MacroCard({ item }: { item: UsMacroIndicator }) {
  const up = item.value !== null && item.previous !== null && item.value > item.previous;
  const down = item.value !== null && item.previous !== null && item.value < item.previous;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.name}</p><p className="mt-1 text-xs text-slate-400">{item.date} · {item.source}</p></div>{up ? <TrendingUp className="h-4 w-4 text-red-600" /> : down ? <TrendingDown className="h-4 w-4 text-emerald-700" /> : null}</div><div className="mt-3 flex items-end gap-2"><p className="text-2xl font-black">{item.value === null ? "—" : item.value.toFixed(2)}</p><span className="pb-1 text-xs text-slate-400">{item.unit}</span>{item.previous !== null && <span className="ml-auto pb-1 text-xs text-slate-400">前值 {item.previous.toFixed(2)}</span>}</div><p className="mt-3 text-sm leading-6 text-slate-500">{item.interpretation}</p></div>;
}

function Summary({ label, value, hint, warning = false }: { label: string; value: string; hint: string; warning?: boolean }) {
  return <Card className={warning ? "border-amber-200 bg-amber-50" : ""}><CardContent className="p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></CardContent></Card>;
}

function NewsCard({ item, compact = false }: { item: UsNewsItem; compact?: boolean }) {
  return <a href={item.url} target="_blank" rel="noreferrer" className={cn("block rounded-2xl border border-slate-200 bg-white transition hover:border-slate-400 hover:shadow-sm", compact ? "p-3" : "p-4")}><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{item.category}</Badge><Badge variant={impactVariant(item.impact)}>{item.impact}</Badge>{item.relatedSymbols.map((symbol) => <Badge key={symbol} variant="outline">{symbol}</Badge>)}</div><h3 className={cn("mt-3 font-black leading-6", compact && "text-sm")}>{item.title}</h3><div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400"><span>{item.domain}</span><span>{formatTime(item.publishedAt)}</span></div></a>;
}
