"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, BrainCircuit, Gauge, Layers3, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aShareHoldings, accountSnapshot } from "@/data/portfolio";
import type { AShareHolding } from "@/data/portfolio";
import { loadImportedPortfolio, type ImportedPortfolioSnapshot } from "@/lib/importedPortfolio";
import { analyzePortfolio, type DimensionScore } from "@/lib/portfolioAnalysis";
import { cn } from "@/lib/utils";

const cny = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const pct = (value: number) => `${value.toFixed(1)}%`;

function statusVariant(status: DimensionScore["status"]): "success" | "warning" | "outline" {
  if (status === "优秀" || status === "正常") return "success";
  if (status === "警惕" || status === "高风险") return "warning";
  return "outline";
}

export default function AnalysisPage() {
  const [snapshot, setSnapshot] = useState<ImportedPortfolioSnapshot | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>("");

  useEffect(() => {
    setSnapshot(loadImportedPortfolio());
  }, []);

  const holdings = snapshot?.holdings?.length ? snapshot.holdings : aShareHoldings;
  const account = snapshot?.account ?? {
    totalAssets: accountSnapshot.aShare.totalAssets,
    marketValue: accountSnapshot.aShare.marketValue,
    availableCash: accountSnapshot.aShare.availableCash,
    totalPnl: accountSnapshot.aShare.totalPnl,
    todayPnl: accountSnapshot.aShare.todayPnl,
    brokerPositionPct: accountSnapshot.aShare.brokerPositionPct,
  };
  const analysis = useMemo(
    () => analyzePortfolio(holdings, account, accountSnapshot.aShare.offsiteCash),
    [holdings, account],
  );
  const selected = analysis.holdingInsights.find((item) => item.holding.code === selectedCode) ?? analysis.topHoldings[0];

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 lg:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />返回作战台
            </a>
            <h1 className="text-2xl font-black sm:text-3xl">多维组合分析</h1>
            <p className="mt-1 text-sm text-slate-500">基于最新A股持仓、账户资金和场外现金进行结构化分析。</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning">截图时点分析</Badge>
            <Badge variant={analysis.overallScore >= 65 ? "success" : "warning"}>{analysis.overallLevel}</Badge>
          </div>
        </header>

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-bold text-slate-300">组合综合评分</p>
              <div className="mt-2 flex items-end gap-3">
                <p className="text-5xl font-black">{analysis.overallScore.toFixed(0)}</p>
                <p className="pb-1 text-sm text-slate-300">/ 100 · {analysis.overallLevel}</p>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{analysis.reviewConclusions[0]}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm md:w-72">
              <Kpi label="真实A股仓位" value={pct(analysis.actualPositionPct)} dark />
              <Kpi label="科技占持仓" value={pct(analysis.techPctOfInvested)} dark />
              <Kpi label="前三大占比" value={pct(analysis.top3Pct)} dark />
              <Kpi label="现金垫" value={pct(analysis.cashPct)} dark />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {analysis.dimensions.map((dimension) => (
            <Card key={dimension.key}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{dimension.label}</p>
                  <Badge variant={statusVariant(dimension.status)}>{dimension.status}</Badge>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <p className="text-3xl font-black">{dimension.score.toFixed(0)}</p>
                  <span className="pb-1 text-xs text-slate-400">分</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full rounded-full", dimension.score >= 65 ? "bg-emerald-500" : "bg-amber-500")}
                    style={{ width: `${dimension.score}%` }}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-500">{dimension.explanation}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers3 className="h-5 w-5" />主题与行业暴露</CardTitle>
              <CardDescription>按主要风险来源归类；重叠主题会在个股分析中另行提示。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysis.themes.map((theme) => (
                <div key={theme.name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-bold">{theme.name}</p>
                      <p className="text-xs text-slate-400">{theme.holdings.join("、")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black">{pct(theme.investedPct)}</p>
                      <p className="text-xs text-slate-400">{cny(theme.marketValue)}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(theme.investedPct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />当前执行优先级</CardTitle>
              <CardDescription>根据持仓结构自动生成，不包含实时买卖点。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.priorities.map((item, index) => (
                <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                  <Badge variant={index < 2 ? "warning" : "secondary"} className="h-fit shrink-0">{index + 1}</Badge>
                  <p className="text-sm font-medium leading-6 text-slate-700">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <RankingCard title="盈利贡献前五" icon={BarChart3} items={analysis.profitLeaders.map((item) => ({
            name: item.holding.name,
            value: item.holding.pnl,
            hint: `持仓占比 ${pct(item.investedWeight)}`,
          }))} positive />
          <RankingCard title="亏损拖累前五" icon={AlertTriangle} items={analysis.lossDrags.map((item) => ({
            name: item.holding.name,
            value: item.holding.pnl,
            hint: `持仓占比 ${pct(item.investedWeight)}`,
          }))} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />静态压力测试</CardTitle>
            <CardDescription>测算科技与防守资产同步回撤时的账户影响，不代表真实预测。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {analysis.stressScenarios.map((scenario) => (
              <div key={scenario.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black">{scenario.name}</p>
                  <Badge variant="warning">科技 {scenario.techShock}%</Badge>
                </div>
                <p className="mt-3 text-2xl font-black text-emerald-700">{cny(scenario.estimatedLoss)}</p>
                <p className="mt-1 text-sm text-slate-500">整体资产影响 {pct(scenario.accountImpactPct)}</p>
                <p className="mt-2 text-xs text-slate-400">防守资产假设 {scenario.defensiveShock}%；压力后累计盈利缓冲约 {cny(scenario.remainingPnlBuffer)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />个股组合适配分析</CardTitle>
            <CardDescription>分析的是该持仓在组合里的角色和风险，不替代公司基本面与实时技术面。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="grid max-h-[520px] gap-2 overflow-auto pr-1">
              {analysis.holdingInsights
                .slice()
                .sort((a, b) => b.holding.marketValue - a.holding.marketValue)
                .map((item) => (
                  <button
                    key={item.holding.code}
                    type="button"
                    onClick={() => setSelectedCode(item.holding.code)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition",
                      selected?.holding.code === item.holding.code ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black">{item.holding.name}</p>
                      <span className="text-xs">{pct(item.investedWeight)}</span>
                    </div>
                    <p className={cn("mt-1 text-xs", selected?.holding.code === item.holding.code ? "text-slate-300" : "text-slate-400")}>{item.primaryTheme} · 风险{item.riskLevel}</p>
                  </button>
                ))}
            </div>
            {selected && (
              <div className="space-y-4 rounded-3xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black">{selected.holding.name}</h3>
                    <p className="text-sm text-slate-500">{selected.holding.code} · {selected.primaryTheme}</p>
                  </div>
                  <Badge variant={selected.riskLevel === "高" ? "warning" : selected.riskLevel === "低" ? "success" : "secondary"}>组合风险 {selected.riskLevel}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Kpi label="持仓市值" value={cny(selected.holding.marketValue)} />
                  <Kpi label="已投资占比" value={pct(selected.investedWeight)} />
                  <Kpi label="整体资产占比" value={pct(selected.totalWeight)} />
                  <Kpi label="累计盈亏" value={cny(selected.holding.pnl)} />
                </div>
                <div>
                  <p className="text-sm font-black">风险重叠</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.overlapThemes.length ? selected.overlapThemes.map((theme) => <Badge key={theme} variant="outline">{theme}</Badge>) : <Badge variant="success">低重叠</Badge>}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-black">当前组合动作</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selected.action}</p>
                </div>
                {selected.dataWarnings.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-black text-amber-900">数据口径提醒</p>
                    {selected.dataWarnings.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-800">• {warning}</p>)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />投研维度覆盖情况</CardTitle>
            <CardDescription>没有数据的维度明确标记为未接入，不使用默认高分填充。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {analysis.dataCoverage.map((item) => (
              <div key={item.dimension} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{item.dimension}</p>
                  <Badge variant={item.status === "已覆盖" ? "success" : item.status === "部分覆盖" ? "warning" : "outline"}>{item.status}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Kpi({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-3", dark ? "bg-white/10" : "bg-white")}>
      <p className={cn("text-xs", dark ? "text-slate-300" : "text-slate-400")}>{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function RankingCard({
  title,
  icon: Icon,
  items,
  positive = false,
}: {
  title: string;
  icon: typeof BarChart3;
  items: { name: string; value: number; hint: string }[];
  positive?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length ? items.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{index + 1}</Badge>
              <div><p className="font-bold">{item.name}</p><p className="text-xs text-slate-400">{item.hint}</p></div>
            </div>
            <p className={cn("font-black", positive ? "text-red-600" : "text-emerald-700")}>{cny(item.value)}</p>
          </div>
        )) : <p className="text-sm text-slate-500">当前没有对应标的。</p>}
      </CardContent>
    </Card>
  );
}
