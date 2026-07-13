"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Globe2, Newspaper, RefreshCw, ServerCog, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MacroIndicator, MarketIntelligencePayload, NewsItem, SourceStatus } from "@/lib/market-intelligence/types";
import { cn } from "@/lib/utils";

const emptyPayload: MarketIntelligencePayload = {
  generatedAt: "",
  regime: { label: "数据不足", score: null, confidence: 0, reasons: [], actionBias: "等待数据。" },
  indices: [],
  macro: [],
  news: [],
  sourceStatus: [],
  warnings: [],
};

function formatTime(value: string) {
  if (!value) return "未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function sourceVariant(status: SourceStatus["status"]): "success" | "warning" | "outline" {
  if (status === "online") return "success";
  if (status === "partial" || status === "error") return "warning";
  return "outline";
}

function impactVariant(impact: NewsItem["impact"]): "success" | "warning" | "outline" | "secondary" {
  if (impact === "利多") return "success";
  if (impact === "利空") return "warning";
  if (impact === "中性") return "secondary";
  return "outline";
}

export default function IntelligencePage() {
  const [data, setData] = useState<MarketIntelligencePayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<NewsItem["category"] | "全部">("全部");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/market-intelligence?t=${Date.now()}`, { cache: "no-store" });
      const payload = (await response.json()) as MarketIntelligencePayload;
      if (!response.ok) throw new Error(payload.warnings?.[0] || "市场情报接口失败");
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "市场情报读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => ["全部", ...new Set(data.news.map((item) => item.category))] as const, [data.news]);
  const filteredNews = category === "全部" ? data.news : data.news.filter((item) => item.category === category);

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 lg:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />返回作战台
            </a>
            <h1 className="text-2xl font-black sm:text-3xl">市场情报与宏观环境</h1>
            <p className="mt-1 text-sm text-slate-500">联网聚合市场指数、宏观指标、海外流动性和过去24小时新闻。</p>
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />刷新
          </Button>
        </header>

        {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

        <Card className={cn("border-none text-white", data.regime.label === "风险偏好改善" ? "bg-emerald-700" : data.regime.label === "风险偏好收缩" ? "bg-rose-700" : "bg-slate-950")}>
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-bold text-white/70">当前市场状态</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <p className="text-4xl font-black">{loading ? "读取中" : data.regime.label}</p>
                <p className="pb-1 text-sm text-white/70">置信度 {data.regime.confidence}%</p>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85">{data.regime.actionBias}</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 text-center md:min-w-40">
              <p className="text-xs text-white/70">环境评分</p>
              <p className="mt-1 text-4xl font-black">{data.regime.score ?? "—"}</p>
              <p className="mt-1 text-xs text-white/60">满分100</p>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />市场状态依据</CardTitle>
              <CardDescription>指数、资金、宏观和海外环境共同决定，不再只看持仓结构。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.regime.reasons.length ? data.regime.reasons.map((item, index) => (
                <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                  <Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge>
                  <p className="text-sm leading-6 text-slate-700">{item}</p>
                </div>
              )) : <p className="text-sm text-slate-500">外部数据不足，暂不生成市场状态。</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5" />数据源状态</CardTitle>
              <CardDescription>每项数据都显示来源、更新时间和配置状态。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.sourceStatus.map((source) => (
                <div key={source.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black">{source.name}</p>
                    <Badge variant={sourceVariant(source.status)}>{source.status === "online" ? "在线" : source.status === "partial" ? "部分可用" : source.status === "not_configured" ? "未配置" : "异常"}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{source.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatTime(source.updatedAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />A股主要指数</CardTitle>
            <CardDescription>来自Tushare Pro；没有Token时明确显示为空，不使用静态数据冒充。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.indices.length ? data.indices.map((item) => (
              <div key={item.code} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold">{item.name}</p>
                <p className="mt-2 text-2xl font-black">{item.close.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</p>
                <p className={cn("mt-1 flex items-center gap-1 text-sm font-black", item.pctChange >= 0 ? "text-red-600" : "text-emerald-700")}>
                  {item.pctChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {item.pctChange >= 0 ? "+" : ""}{item.pctChange.toFixed(2)}%
                </p>
                <p className="mt-2 text-xs text-slate-400">{item.tradeDate} · {item.source}</p>
              </div>
            )) : <p className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">A股指数接口尚未配置或暂时不可用。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" />宏观与流动性仪表盘</CardTitle>
            <CardDescription>中国宏观由Tushare提供；海外利率与波动率由FRED提供。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.macro.length ? data.macro.map((item) => <MacroCard key={item.id} item={item} />) : <p className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">宏观数据源尚未配置。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Newspaper className="h-5 w-5" />过去24小时新闻动态</CardTitle>
            <CardDescription>GDELT覆盖全球多语言媒体；“利多/利空”是关键词规则初筛，必须打开原文判断。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button key={item} type="button" onClick={() => setCategory(item)} className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-bold", category === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600")}>{item}</button>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredNews.length ? filteredNews.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{item.category}</Badge>
                    <Badge variant={impactVariant(item.impact)}>{item.impact}</Badge>
                  </div>
                  <h3 className="mt-3 font-black leading-6">{item.title}</h3>
                  {item.relevance.length > 0 && <p className="mt-2 text-xs text-slate-500">关联：{item.relevance.join("、")}</p>}
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{item.domain}</span><span>{formatTime(item.publishedAt)}</span>
                  </div>
                </a>
              )) : <p className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">过去24小时未获取到符合条件的新闻。</p>}
            </div>
          </CardContent>
        </Card>

        {data.warnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900"><ShieldAlert className="h-5 w-5" />接口与数据警告</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.warnings.map((warning) => <p key={warning} className="text-sm leading-6 text-amber-800">• {warning}</p>)}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400">最后聚合时间：{formatTime(data.generatedAt)}</p>
      </div>
    </main>
  );
}

function MacroCard({ item }: { item: MacroIndicator }) {
  const isUp = item.direction === "up";
  const isDown = item.direction === "down";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-black">{item.name}</p><p className="mt-1 text-xs text-slate-400">{item.period} · {item.source}</p></div>
        <Badge variant={item.value === null ? "outline" : "secondary"}>{item.value === null ? "缺失" : "已更新"}</Badge>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-2xl font-black">{item.value === null ? "—" : item.value.toFixed(2)}</p>
        <span className="pb-1 text-xs text-slate-400">{item.unit}</span>
        {item.value !== null && item.previous !== null && <span className={cn("ml-auto pb-1 text-xs font-black", isUp ? "text-red-600" : isDown ? "text-emerald-700" : "text-slate-400")}>{isUp ? "↑" : isDown ? "↓" : "→"} 前值 {item.previous.toFixed(2)}</span>}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">{item.interpretation}</p>
    </div>
  );
}
