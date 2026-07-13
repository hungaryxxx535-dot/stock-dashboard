"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, BrainCircuit, Gauge, Globe2, Newspaper, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aShareHoldings, accountSnapshot } from "@/data/portfolio";
import { loadImportedPortfolio, type ImportedPortfolioSnapshot } from "@/lib/importedPortfolio";
import type { MarketIntelligencePayload, NewsItem } from "@/lib/market-intelligence/types";
import { analyzePortfolio, type DimensionScore } from "@/lib/portfolioAnalysis";
import { cn } from "@/lib/utils";

const cny = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const pct = (value: number) => `${value.toFixed(1)}%`;

const emptyMarket: MarketIntelligencePayload = {
  generatedAt: "",
  regime: { label: "数据不足", score: null, confidence: 0, reasons: [], actionBias: "等待外部数据。" },
  indices: [],
  macro: [],
  news: [],
  sourceStatus: [],
  warnings: [],
};

function statusVariant(status: DimensionScore["status"]): "success" | "warning" | "outline" {
  if (status === "优秀" || status === "正常") return "success";
  if (status === "警惕" || status === "高风险") return "warning";
  return "outline";
}

function formatTime(value: string) {
  if (!value) return "未更新";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function newsForHolding(news: NewsItem[], name: string, primaryTheme: string) {
  const direct = news.filter((item) => item.relevance.some((tag) => tag.includes(name) || name.includes(tag)));
  if (direct.length) return direct.slice(0, 5);
  const sectorKeywords: Record<string, RegExp> = {
    "半导体/芯片": /半导体|芯片|semiconductor|chip/i,
    "光通信/通信": /光通信|通信|optical|telecom/i,
    "算力硬件": /算力|服务器|data center|server|computing/i,
    "AI成长": /人工智能|AI|artificial intelligence/i,
    "银行防守": /银行|bank|利率|流动性/i,
    "黄金防守": /黄金|gold|避险/i,
  };
  const pattern = sectorKeywords[primaryTheme];
  return pattern ? news.filter((item) => pattern.test(`${item.title} ${item.relevance.join(" ")}`)).slice(0, 5) : [];
}

export default function AnalysisPage() {
  const [snapshot, setSnapshot] = useState<ImportedPortfolioSnapshot | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [market, setMarket] = useState<MarketIntelligencePayload>(emptyMarket);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");

  useEffect(() => {
    setSnapshot(loadImportedPortfolio());
  }, []);

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    setMarketError("");
    try {
      const response = await fetch(`/api/market-intelligence?t=${Date.now()}`, { cache: "no-store" });
      const payload = (await response.json()) as MarketIntelligencePayload;
      if (!response.ok) throw new Error(payload.warnings?.[0] || "外部市场数据读取失败");
      setMarket(payload);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : "外部市场数据读取失败");
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  const holdings = snapshot?.holdings?.length ? snapshot.holdings : aShareHoldings;
  const account = snapshot?.account ?? {
    totalAssets: accountSnapshot.aShare.totalAssets,
    marketValue: accountSnapshot.aShare.marketValue,
    availableCash: accountSnapshot.aShare.availableCash,
    totalPnl: accountSnapshot.aShare.totalPnl,
    todayPnl: accountSnapshot.aShare.todayPnl,
    brokerPositionPct: accountSnapshot.aShare.brokerPositionPct,
  };
  const analysis = useMemo(() => analyzePortfolio(holdings, account, accountSnapshot.aShare.offsiteCash), [holdings, account]);
  const selected = analysis.holdingInsights.find((item) => item.holding.code === selectedCode) ?? analysis.topHoldings[0];
  const selectedNews = selected ? newsForHolding(market.news, selected.holding.name, selected.primaryTheme) : [];
  const integratedScore = market.regime.score === null ? analysis.overallScore : analysis.overallScore * 0.62 + market.regime.score * 0.38;
  const externalOnline = market.sourceStatus.filter((item) => item.status === "online" || item.status === "partial").length;

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 lg:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />返回作战台</a>
            <h1 className="text-2xl font-black sm:text-3xl">多维投研决策</h1>
            <p className="mt-1 text-sm text-slate-500">持仓结构、宏观、市场状态和新闻动态联合分析。</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={market.regime.label === "风险偏好改善" ? "success" : market.regime.label === "风险偏好收缩" ? "warning" : "secondary"}>{marketLoading ? "外部数据读取中" : market.regime.label}</Badge>
            <Button variant="outline" size="sm" onClick={() => void loadMarket()} disabled={marketLoading}><RefreshCw className={cn("mr-2 h-4 w-4", marketLoading && "animate-spin")} />刷新外部数据</Button>
          </div>
        </header>

        {marketError && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{marketError}</div>}

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold text-slate-300">综合决策评分</p>
              <div className="mt-2 flex items-end gap-3"><p className="text-5xl font-black">{integratedScore.toFixed(0)}</p><p className="pb-1 text-sm text-slate-300">/ 100</p></div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{market.regime.score === null ? "外部宏观与市场接口数据不足，当前评分暂时以持仓结构为主。" : `${market.regime.label}：${market.regime.actionBias}`}</p>
              <p className="mt-2 text-xs text-slate-400">组合结构分 {analysis.overallScore.toFixed(0)} · 市场环境分 {market.regime.score ?? "—"} · 外部数据源可用 {externalOnline}/{market.sourceStatus.length || 3}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm lg:w-80">
              <Kpi label="真实A股仓位" value={pct(analysis.actualPositionPct)} dark />
              <Kpi label="市场环境" value={market.regime.score === null ? "—" : String(market.regime.score)} dark />
              <Kpi label="前三大占比" value={pct(analysis.top3Pct)} dark />
              <Kpi label="24h相关新闻" value={String(market.news.length)} dark />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" />外部市场环境</CardTitle><CardDescription>当前分析已开始读取宏观、指数、资金面和海外流动性。</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {market.regime.reasons.length ? market.regime.reasons.map((item, index) => <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><Badge variant="secondary" className="h-fit">{index + 1}</Badge><p className="text-sm leading-6 text-slate-700">{item}</p></div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">外部接口未返回足够数据。</p>}
              <a href="/intelligence" className="inline-flex text-sm font-black text-cyan-700 hover:text-cyan-900">打开完整市场情报 →</a>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />当前执行重点</CardTitle><CardDescription>先结合市场局势，再决定持仓动作，不再把“是否重复持仓”作为主要提示。</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-sm font-black text-cyan-950">市场动作倾向</p><p className="mt-2 text-sm leading-6 text-cyan-900">{market.regime.actionBias}</p></div>
              {analysis.priorities.filter((item) => !/重叠|风险簇|低相关/.test(item)).slice(0, 4).map((item, index) => <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><Badge variant={index < 1 ? "warning" : "secondary"} className="h-fit">{index + 1}</Badge><p className="text-sm leading-6 text-slate-700">{item}</p></div>)}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {analysis.dimensions.map((dimension) => <Card key={dimension.key}><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><p className="font-black">{dimension.label}</p><Badge variant={statusVariant(dimension.status)}>{dimension.status}</Badge></div><div className="mt-3 flex items-end gap-2"><p className="text-3xl font-black">{dimension.score.toFixed(0)}</p><span className="pb-1 text-xs text-slate-400">分</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", dimension.score >= 65 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${dimension.score}%` }} /></div><p className="mt-3 text-sm leading-6 text-slate-500">{dimension.explanation}</p></CardContent></Card>)}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>行业与主题配置</CardTitle><CardDescription>用于看资金分布，不再据此简单判断持仓重复。</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {analysis.themes.map((theme) => <div key={theme.name}><div className="flex items-center justify-between gap-3 text-sm"><div><p className="font-bold">{theme.name}</p><p className="text-xs text-slate-400">{theme.holdings.join("、")}</p></div><div className="text-right"><p className="font-black">{pct(theme.investedPct)}</p><p className="text-xs text-slate-400">{cny(theme.marketValue)}</p></div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(theme.investedPct, 100)}%` }} /></div></div>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Newspaper className="h-5 w-5" />最新新闻影响</CardTitle><CardDescription>展示与当前持仓及重点行业相关的外部信息。</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {market.news.slice(0, 6).map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-slate-50 p-3 hover:bg-slate-100"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{item.category}</Badge><Badge variant={item.impact === "利空" ? "warning" : item.impact === "利多" ? "success" : "outline"}>{item.impact}</Badge></div><p className="mt-2 text-sm font-bold leading-6">{item.title}</p><p className="mt-1 text-xs text-slate-400">{item.domain} · {item.relevance.join("、") || "市场整体"}</p></a>)}
              {!market.news.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">暂未获得新闻数据。</p>}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <RankingCard title="盈利贡献前五" icon={BarChart3} items={analysis.profitLeaders.map((item) => ({ name: item.holding.name, value: item.holding.pnl, hint: `持仓占比 ${pct(item.investedWeight)}` }))} positive />
          <RankingCard title="亏损拖累前五" icon={AlertTriangle} items={analysis.lossDrags.map((item) => ({ name: item.holding.name, value: item.holding.pnl, hint: `持仓占比 ${pct(item.investedWeight)}` }))} />
        </section>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />压力测试</CardTitle><CardDescription>静态回撤情景与外部市场环境分开显示，后续接入历史波动和相关系数。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {analysis.stressScenarios.map((scenario) => <div key={scenario.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><p className="font-black">{scenario.name}</p><Badge variant="warning">科技 {scenario.techShock}%</Badge></div><p className="mt-3 text-2xl font-black text-emerald-700">{cny(scenario.estimatedLoss)}</p><p className="mt-1 text-sm text-slate-500">整体资产影响 {pct(scenario.accountImpactPct)}</p><p className="mt-2 text-xs text-slate-400">压力后累计盈利缓冲约 {cny(scenario.remainingPnlBuffer)}</p></div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />个股决策适配</CardTitle><CardDescription>将组合角色与最新外部新闻结合；基本面和实时技术数据未接入时不会伪造。</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
              {analysis.holdingInsights.slice().sort((a, b) => b.holding.marketValue - a.holding.marketValue).map((item) => <button key={item.holding.code} type="button" onClick={() => setSelectedCode(item.holding.code)} className={cn("rounded-2xl border p-3 text-left transition", selected?.holding.code === item.holding.code ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:bg-slate-50")}><div className="flex items-center justify-between gap-2"><p className="font-black">{item.holding.name}</p><span className="text-xs">{pct(item.investedWeight)}</span></div><p className={cn("mt-1 text-xs", selected?.holding.code === item.holding.code ? "text-slate-300" : "text-slate-400")}>{item.primaryTheme} · 风险{item.riskLevel}</p></button>)}
            </div>
            {selected && <div className="space-y-4 rounded-3xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-2xl font-black">{selected.holding.name}</h3><p className="text-sm text-slate-500">{selected.holding.code} · {selected.primaryTheme}</p></div><Badge variant={selected.riskLevel === "高" ? "warning" : selected.riskLevel === "低" ? "success" : "secondary"}>组合风险 {selected.riskLevel}</Badge></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Kpi label="持仓市值" value={cny(selected.holding.marketValue)} /><Kpi label="已投资占比" value={pct(selected.investedWeight)} /><Kpi label="整体资产占比" value={pct(selected.totalWeight)} /><Kpi label="累计盈亏" value={cny(selected.holding.pnl)} /></div><div className="rounded-2xl bg-white p-4"><p className="text-sm font-black">当前动作框架</p><p className="mt-2 text-sm leading-6 text-slate-600">{selected.action}</p><p className="mt-2 text-xs text-slate-400">外部环境：{market.regime.label}。{market.regime.actionBias}</p></div><div><p className="text-sm font-black">相关外部信息</p><div className="mt-2 space-y-2">{selectedNews.length ? selectedNews.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-white p-3 hover:bg-slate-100"><div className="flex gap-2"><Badge variant="secondary">{item.category}</Badge><Badge variant={item.impact === "利空" ? "warning" : item.impact === "利多" ? "success" : "outline"}>{item.impact}</Badge></div><p className="mt-2 text-sm font-bold leading-6">{item.title}</p></a>) : <p className="rounded-2xl bg-white p-3 text-sm text-slate-500">过去24小时未发现直接相关信息。</p>}</div></div>{selected.dataWarnings.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-black text-amber-900">数据口径提醒</p>{selected.dataWarnings.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-800">• {warning}</p>)}</div>}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />数据覆盖与来源</CardTitle><CardDescription>每一类分析都显示是否真正联网，缺失项不参与评分。</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {analysis.dataCoverage.filter((item) => !["宏观与行业景气", "资金面与机构动向"].includes(item.dimension)).map((item) => <div key={item.dimension} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{item.dimension}</p><Badge variant={item.status === "已覆盖" ? "success" : item.status === "部分覆盖" ? "warning" : "outline"}>{item.status}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-500">{item.note}</p></div>)}
            <CoverageCard title="宏观与市场局势" active={market.macro.length > 0 || market.indices.length > 0} note={market.macro.length || market.indices.length ? `已读取${market.indices.length}项指数、${market.macro.length}项宏观指标；更新于${formatTime(market.generatedAt)}。` : "Tushare/FRED尚未配置或接口暂不可用。"} />
            <CoverageCard title="新闻与事件动态" active={market.news.length > 0} note={market.news.length ? `GDELT已读取过去24小时${market.news.length}条新闻。` : "新闻接口暂未返回可用数据。"} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Kpi({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return <div className={cn("rounded-2xl p-3", dark ? "bg-white/10" : "bg-white")}><p className={cn("text-xs", dark ? "text-slate-300" : "text-slate-400")}>{label}</p><p className="mt-1 font-black">{value}</p></div>;
}

function CoverageCard({ title, active, note }: { title: string; active: boolean; note: string }) {
  return <div className="rounded-2xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{title}</p><Badge variant={active ? "success" : "outline"}>{active ? "已联网" : "未接入"}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-500">{note}</p></div>;
}

function RankingCard({ title, icon: Icon, items, positive = false }: { title: string; icon: typeof BarChart3; items: { name: string; value: number; hint: string }[]; positive?: boolean }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle></CardHeader><CardContent className="space-y-2">{items.length ? items.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div className="flex items-center gap-3"><Badge variant="secondary">{index + 1}</Badge><div><p className="font-bold">{item.name}</p><p className="text-xs text-slate-400">{item.hint}</p></div></div><p className={cn("font-black", positive ? "text-red-600" : "text-emerald-700")}>{cny(item.value)}</p></div>) : <p className="text-sm text-slate-500">当前没有对应标的。</p>}</CardContent></Card>;
}
