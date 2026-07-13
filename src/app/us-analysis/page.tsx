import { ArrowLeft, BarChart3, BrainCircuit, CalendarCheck, Globe2, Landmark, Newspaper, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usHoldings } from "@/data/portfolio";
import { analyzeUsPortfolio } from "@/lib/usAnalysis";
import { getUsCloseFromApi } from "@/lib/usCloseApi";
import { getUsMarketIntelligence } from "@/lib/usMarketIntelligence";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function formatTime(value: string) {
  if (!value) return "未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export default async function UsAnalysisPage() {
  const [closeData, intelligence] = await Promise.all([
    getUsCloseFromApi(),
    getUsMarketIntelligence(),
  ]);
  const analysis = analyzeUsPortfolio(usHoldings, closeData, intelligence);
  const regimeVariant = analysis.regime === "进攻环境" ? "success" : analysis.regime === "防守环境" ? "destructive" : analysis.regime === "数据不足" ? "outline" : "warning";

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 lg:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />返回作战台</a>
            <h1 className="text-2xl font-black sm:text-3xl">美股宏观与持仓决策</h1>
            <p className="mt-1 text-sm text-slate-500">把美股收盘价、指数、利率、通胀、就业和过去24小时新闻合并判断。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={regimeVariant}>{analysis.regime}</Badge>
            <a href="/us-close" className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black shadow-sm hover:bg-slate-50">查看收盘明细</a>
          </div>
        </header>

        <Card className={cn("border-none text-white", analysis.regime === "进攻环境" ? "bg-emerald-700" : analysis.regime === "防守环境" ? "bg-rose-700" : "bg-slate-950")}>
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-bold text-white/70">当前综合判断</p>
              <h2 className="mt-2 text-3xl font-black leading-tight">{analysis.headline}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85">{analysis.actionBias}</p>
              <p className="mt-3 text-xs text-white/60">置信度 {analysis.confidence}% · 美股收盘数据：{closeData.status === "updated" ? closeData.tradingDate : "接口回退"} · 外部情报：{formatTime(intelligence.generatedAt)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center lg:w-80">
              <DarkKpi label="市场环境分" value={analysis.score === null ? "—" : String(analysis.score)} />
              <DarkKpi label="持仓当日表现" value={pct(analysis.weightedDayChange)} />
              <DarkKpi label="AI/算力仓位" value={`${analysis.aiInfrastructurePct.toFixed(1)}%`} />
              <DarkKpi label="第一大仓" value={`${analysis.topHolding} ${analysis.topWeight.toFixed(1)}%`} />
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="美股估算市值" value={usd(analysis.totalValue)} hint={`收盘价来源：${closeData.source}`} />
          <SummaryCard label="估算累计盈亏" value={`${analysis.totalPnl >= 0 ? "+" : ""}${usd(analysis.totalPnl)}`} hint={`收益率 ${pct(analysis.totalPnlPct)}`} warning={analysis.totalPnl < 0} />
          <SummaryCard label="涨跌家数" value={`${analysis.risingCount}涨 / ${analysis.fallingCount}跌`} hint={`${analysis.flatCount}只平盘或无涨跌数据`} />
          <SummaryCard label="中概/杠杆暴露" value={`${analysis.chinaAdrPct.toFixed(1)}% / ${analysis.leveragedPct.toFixed(1)}%`} hint="前者受中美双重宏观，后者存在杠杆衰减" warning={analysis.leveragedPct > 5} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />市场判断依据</CardTitle>
              <CardDescription>不是只看持仓涨跌，而是同时考虑指数、波动率、利率、通胀和就业。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {analysis.reasons.map((reason, index) => (
                <div key={reason} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                  <Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge>
                  <p className="text-sm leading-6 text-slate-700">{reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />账户级结论</CardTitle>
              <CardDescription>把外部局势转化为与你现有美股仓位有关的判断。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.reviewPoints.map((point, index) => (
                <div key={point} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-black text-slate-400">结论 {index + 1}</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-700">{point}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />美股宏观仪表盘</CardTitle>
            <CardDescription>数据来自FRED官方公开序列；每项指标显示具体期间，避免把月度数据当成当天数据。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {analysis.macroCards.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-black">{item.name}</p><p className="mt-1 text-xs text-slate-400">{item.period}</p></div>
                  {item.direction === "up" ? <TrendingUp className="h-4 w-4 text-red-600" /> : item.direction === "down" ? <TrendingDown className="h-4 w-4 text-emerald-700" /> : <Globe2 className="h-4 w-4 text-slate-400" />}
                </div>
                <p className="mt-3 text-2xl font-black">{item.value === null ? "—" : item.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}<span className="ml-1 text-xs font-medium text-slate-400">{item.unit}</span></p>
                <p className="mt-3 text-sm leading-6 text-slate-500">{item.interpretation}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />逐只持仓决策框架</CardTitle>
            <CardDescription>动作建议同时参考市场环境、最新收盘价、止损目标位、仓位和相关新闻。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {analysis.holdings.map((item) => (
              <div key={item.code} className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">{item.code} · {item.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">{item.factor}</p>
                  </div>
                  <Badge variant={item.risk === "高" ? "destructive" : item.risk === "中" ? "warning" : "success"}>风险{item.risk}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Mini label="收盘价" value={usd(item.close)} />
                  <Mini label="当日涨跌" value={pct(item.changePct)} />
                  <Mini label="持仓占比" value={`${item.weight.toFixed(1)}%`} />
                  <Mini label="估算盈亏" value={`${item.pnl >= 0 ? "+" : ""}${usd(item.pnl)}`} />
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-400">宏观敏感性</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{item.macroSensitivity}</p>
                </div>
                <div className="mt-3 rounded-2xl bg-cyan-50 p-3">
                  <p className="text-xs font-black text-cyan-700">当前动作</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-cyan-950">{item.action}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Mini label="距止损线" value={item.distanceToStopPct === null ? "—" : `${item.distanceToStopPct.toFixed(1)}%`} />
                  <Mini label="距目标价" value={item.distanceToTargetPct === null ? "—" : `${item.distanceToTargetPct.toFixed(1)}%`} />
                </div>
                {item.news.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-black text-slate-400">过去24小时相关信息</p>
                    {item.news.slice(0, 3).map((news) => (
                      <a key={news.id} href={news.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-slate-200 p-3 hover:bg-slate-50">
                        <div className="flex gap-2"><Badge variant="secondary">{news.category}</Badge><Badge variant={news.impact === "利空" ? "destructive" : news.impact === "利多" ? "success" : "outline"}>{news.impact}</Badge></div>
                        <p className="mt-2 text-sm font-bold leading-6">{news.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{news.domain}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Newspaper className="h-5 w-5" />美股市场与宏观新闻</CardTitle>
            <CardDescription>“利多/利空”只是关键词初筛，真正下判断必须阅读原文并核验来源。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {analysis.importantNews.length ? analysis.importantNews.map((item) => (
              <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-400 hover:shadow-sm">
                <div className="flex flex-wrap gap-2"><Badge variant="secondary">{item.category}</Badge><Badge variant={item.impact === "利空" ? "destructive" : item.impact === "利多" ? "success" : "outline"}>{item.impact}</Badge></div>
                <h3 className="mt-3 font-black leading-6">{item.title}</h3>
                <p className="mt-2 text-xs text-slate-500">关联：{item.relevance.join("、") || "美股整体"}</p>
                <div className="mt-3 flex justify-between gap-2 text-xs text-slate-400"><span>{item.domain}</span><span>{formatTime(item.publishedAt)}</span></div>
              </a>
            )) : <p className="col-span-full rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">过去24小时未获得可用的美股相关新闻。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarCheck className="h-5 w-5" />数据源与边界</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {intelligence.sourceStatus.map((source) => (
              <div key={source.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2"><p className="font-black">{source.name}</p><Badge variant={source.status === "online" ? "success" : source.status === "partial" ? "warning" : "destructive"}>{source.status === "online" ? "在线" : source.status === "partial" ? "部分可用" : "异常"}</Badge></div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{source.message}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 p-3">
              <p className="font-black">Twelve Data收盘价</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{closeData.description}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function DarkKpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-white/65">{label}</p><p className="mt-1 break-words font-black">{value}</p></div>;
}

function SummaryCard({ label, value, hint, warning = false }: { label: string; value: string; hint: string; warning?: boolean }) {
  return <Card className={warning ? "border-amber-200 bg-amber-50" : ""}><CardContent className="p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></CardContent></Card>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 break-words font-black">{value}</p></div>;
}
