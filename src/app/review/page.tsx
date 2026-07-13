"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, CheckCircle2, ClipboardList, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aShareHoldings, accountSnapshot, operationRecords } from "@/data/portfolio";
import { latestAShareScreenshotSnapshot } from "@/data/latest-a-share-screenshot";
import { loadImportedPortfolio, type ImportedPortfolioSnapshot } from "@/lib/importedPortfolio";
import { analyzePortfolio, compareHoldings } from "@/lib/portfolioAnalysis";
import { createTradeReview, loadTradeReviews, saveTradeReviews, type TradeReviewEntry } from "@/lib/tradeReview";
import { cn } from "@/lib/utils";

const cny = (value: number) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const pct = (value: number) => `${value.toFixed(1)}%`;

export default function ReviewPage() {
  const [snapshot, setSnapshot] = useState<ImportedPortfolioSnapshot | null>(null);
  const [reviews, setReviews] = useState<TradeReviewEntry[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    symbol: "",
    action: "持有复盘",
    thesis: "",
    execution: "",
    result: "",
    lesson: "",
    disciplineScore: 70,
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSnapshot(loadImportedPortfolio());
    setReviews(loadTradeReviews());
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
  const changes = useMemo(
    () => compareHoldings(holdings, latestAShareScreenshotSnapshot.holdings),
    [holdings],
  );
  const averageDiscipline = reviews.length
    ? reviews.reduce((sum, item) => sum + item.disciplineScore, 0) / reviews.length
    : 0;

  const submitReview = () => {
    setMessage("");
    if (!form.symbol.trim() || !form.thesis.trim() || !form.execution.trim()) {
      setMessage("请至少填写标的、原始逻辑和实际执行。");
      return;
    }
    const entry = createTradeReview({
      ...form,
      symbol: form.symbol.trim(),
      thesis: form.thesis.trim(),
      execution: form.execution.trim(),
      result: form.result.trim(),
      lesson: form.lesson.trim(),
      disciplineScore: Number(form.disciplineScore),
    });
    const next = [entry, ...reviews];
    setReviews(next);
    saveTradeReviews(next);
    setForm((previous) => ({ ...previous, symbol: "", thesis: "", execution: "", result: "", lesson: "" }));
    setMessage("复盘记录已保存在当前浏览器。 ");
  };

  const removeReview = (id: string) => {
    const next = reviews.filter((item) => item.id !== id);
    setReviews(next);
    saveTradeReviews(next);
  };

  return (
    <main className="min-h-screen bg-slate-100 pb-24 text-slate-950">
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 lg:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a href="/" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />返回作战台
            </a>
            <h1 className="text-2xl font-black sm:text-3xl">组合与交易复盘</h1>
            <p className="mt-1 text-sm text-slate-500">把“赚亏结果”拆成仓位、逻辑、执行和纪律四个部分。</p>
          </div>
          <Badge variant={reviews.length ? "success" : "warning"}>本机复盘 {reviews.length} 条</Badge>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="累计持仓盈亏" value={cny(analysis.holdingsPnl)} hint={`盈利${analysis.profitableCount}只 / 亏损${analysis.losingCount}只`} />
          <SummaryCard label="前三大利润依赖" value={pct(analysis.topProfitDependencyPct)} hint="越高越依赖少数主线" warning={analysis.topProfitDependencyPct > 75} />
          <SummaryCard label="前三大持仓" value={pct(analysis.top3Pct)} hint="衡量单票集中度" warning={analysis.top3Pct > 50} />
          <SummaryCard label="平均纪律分" value={reviews.length ? averageDiscipline.toFixed(0) : "—"} hint={reviews.length ? "来自手工交易复盘" : "尚未录入交易复盘"} warning={reviews.length > 0 && averageDiscipline < 65} />
        </section>

        <Card className="border-slate-900 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />本期自动复盘结论</CardTitle>
            <CardDescription className="text-slate-300">仅使用持仓截图和资金结构，不引入未经核验的实时信息。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {analysis.reviewConclusions.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl bg-white/10 p-3">
                <Badge variant="secondary" className="h-fit shrink-0">{index + 1}</Badge>
                <p className="text-sm leading-6 text-slate-200">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />本期做对了什么</CardTitle>
              <CardDescription>从组合结果中提炼可重复的优势。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ReviewPoint text={`累计正收益约${cny(analysis.positivePnl)}，说明核心科技主线曾经贡献显著超额收益。`} good />
              <ReviewPoint text={`纳入场外现金后的A股仓位约${pct(analysis.actualPositionPct)}，当前主要矛盾不是满仓，而是方向集中。`} good />
              <ReviewPoint text={`招商银行和黄金等防守仓占持仓${pct(analysis.defensivePctOfInvested)}，已经具备一定稳定器作用。`} good />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TriangleAlert className="h-5 w-5" />本期需要纠正什么</CardTitle>
              <CardDescription>重点找可控错误，而不是简单归因于市场。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ReviewPoint text={`科技成长占已投资市值${pct(analysis.techPctOfInvested)}，半导体、算力和通信的相关风险被重复持有。`} />
              <ReviewPoint text={`前三大利润来源占全部正收益${pct(analysis.topProfitDependencyPct)}，如果没有移动止盈，历史利润可能集中回撤。`} />
              <ReviewPoint text={`亏损拖累最大的标的是${analysis.lossDrags.slice(0, 3).map((item) => item.holding.name).join("、") || "暂无"}，需要逐项确认买入逻辑和退出条件。`} />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>盈利与亏损归因</CardTitle>
              <CardDescription>按累计盈亏排序，负成本和零成本标的仅展示金额，不计算收益率。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Attribution title="主要盈利来源" items={analysis.profitLeaders.map((item) => ({ name: item.holding.name, value: item.holding.pnl, weight: item.investedWeight }))} positive />
              <Attribution title="主要亏损拖累" items={analysis.lossDrags.map((item) => ({ name: item.holding.name, value: item.holding.pnl, weight: item.investedWeight }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" />持仓变化复盘</CardTitle>
              <CardDescription>将浏览器最新导入与2026-07-13正式底表比较。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {snapshot && changes.length ? changes.slice(0, 12).map((item) => (
                <div key={item.code} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.code} · 数量变化 {item.quantityChange > 0 ? "+" : ""}{item.quantityChange.toLocaleString("zh-CN")}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={item.status === "加仓" || item.status === "新增" ? "warning" : item.status === "减仓" || item.status === "清仓" ? "success" : "outline"}>{item.status}</Badge>
                    <p className={cn("mt-1 text-xs font-bold", item.marketValueChange >= 0 ? "text-red-600" : "text-emerald-700")}>{item.marketValueChange >= 0 ? "+" : ""}{cny(item.marketValueChange)}</p>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                  当前没有比正式底表更新的本机截图，暂时无法识别加仓、减仓和清仓变化。下一次导入新截图后，这里会自动生成差异复盘。
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />新增交易复盘</CardTitle>
            <CardDescription>每次重要买卖都记录“当时为什么做”和“后来是否按纪律执行”。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm font-bold">日期<Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-bold">标的<Input placeholder="中际旭创 / 300308" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-bold">动作<select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}><option>买入复盘</option><option>加仓复盘</option><option>减仓复盘</option><option>清仓复盘</option><option>持有复盘</option><option>止损复盘</option></select></label>
              <label className="grid gap-1 text-sm font-bold">纪律分<Input type="number" min="0" max="100" value={form.disciplineScore} onChange={(event) => setForm({ ...form, disciplineScore: Number(event.target.value) })} /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextArea label="原始逻辑" value={form.thesis} onChange={(value) => setForm({ ...form, thesis: value })} placeholder="为什么买、预期催化、失效条件是什么" />
              <TextArea label="实际执行" value={form.execution} onChange={(value) => setForm({ ...form, execution: value })} placeholder="是否按计划价位、仓位和止损执行" />
              <TextArea label="结果" value={form.result} onChange={(value) => setForm({ ...form, result: value })} placeholder="赚亏结果、持有时间、最大回撤" />
              <TextArea label="经验教训" value={form.lesson} onChange={(value) => setForm({ ...form, lesson: value })} placeholder="下次要重复什么、禁止什么" />
            </div>
            {message && <p className={cn("rounded-2xl p-3 text-sm font-bold", message.includes("已保存") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{message}</p>}
            <Button onClick={submitReview}>保存复盘</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" />个人交易复盘记录</CardTitle>
            <CardDescription>记录只保存在当前浏览器，后续可再升级为云端账户。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviews.length ? reviews.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-400">{item.date} · {item.action}</p>
                    <h3 className="mt-1 text-lg font-black">{item.symbol}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.disciplineScore >= 75 ? "success" : item.disciplineScore >= 60 ? "warning" : "outline"}>纪律 {item.disciplineScore}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeReview(item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <ReviewField label="原始逻辑" value={item.thesis} />
                  <ReviewField label="实际执行" value={item.execution} />
                  <ReviewField label="结果" value={item.result || "未填写"} />
                  <ReviewField label="经验教训" value={item.lesson || "未填写"} />
                </div>
              </div>
            )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">还没有手工复盘记录。先从最近一次加仓、减仓或止损开始。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>历史平台记录</CardTitle>
            <CardDescription>保留已有的持仓更新与操作记录，作为复盘时间线。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {operationRecords.map((item) => (
              <div key={`${item.date}-${item.symbol}-${item.action}`} className="rounded-2xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">{item.date} · {item.symbol}</p><Badge variant="outline">{item.action}</Badge></div>
                <p className="mt-2 text-slate-600"><span className="font-bold">原因：</span>{item.reason}</p>
                <p className="mt-1 text-slate-600"><span className="font-bold">结果：</span>{item.result}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, hint, warning = false }: { label: string; value: string; hint: string; warning?: boolean }) {
  return (
    <Card className={warning ? "border-amber-200 bg-amber-50" : ""}>
      <CardContent className="p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></CardContent>
    </Card>
  );
}

function ReviewPoint({ text, good = false }: { text: string; good?: boolean }) {
  return <div className={cn("rounded-2xl p-3 text-sm leading-6", good ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>• {text}</div>;
}

function Attribution({ title, items, positive = false }: { title: string; items: { name: string; value: number; weight: number }[]; positive?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-sm font-black">{title}</p>
      <div className="space-y-2">
        {items.length ? items.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center gap-2"><Badge variant="secondary">{index + 1}</Badge><div><p className="font-bold">{item.name}</p><p className="text-xs text-slate-400">持仓占比 {pct(item.weight)}</p></div></div>
            <p className={cn("font-black", positive ? "text-red-600" : "text-emerald-700")}>{cny(item.value)}</p>
          </div>
        )) : <p className="text-sm text-slate-400">暂无对应标的。</p>}
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1 text-sm font-bold">{label}<textarea className="min-h-28 rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-950" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 leading-6 text-slate-700">{value}</p></div>;
}
