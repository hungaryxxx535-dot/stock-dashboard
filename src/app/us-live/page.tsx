import { ArrowLeft, DatabaseZap, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getALiveQuotes, ALiveData, ALiveQuote } from "@/lib/aLiveApi";

export const dynamic = "force-dynamic";

const formatNum = (value: number | null) => (value === null ? "-" : value.toFixed(2));
const formatPct = (value: number | null) => (value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`);

export default async function ALivePage() {
  let liveData: ALiveData;
  try {
    liveData = await getALiveQuotes();
  } catch {
    liveData = { status: "failed", source: "未知", updatedAt: "", quoteCount: 0, quotes: [], disclaimer: "数据不可用" };
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">A股盘中观察</h1>
              <Badge variant={liveData.status === "updated" ? "success" : "destructive"}>{liveData.status === "updated" ? "已更新" : "更新失败"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">数据源：{liveData.source} · 更新时间：{liveData.updatedAt}</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        {liveData.quotes.map((q: ALiveQuote) => (
          <Card key={q.symbol} className="rounded-2xl border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>{q.symbol} · {q.name}</CardTitle>
              <CardDescription>{q.role}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-sm">
              <div>最新价: {formatNum(q.price)}</div>
              <div>涨跌额: {formatNum(q.change)}</div>
              <div>涨跌幅: {formatPct(q.changePct)}</div>
              <div>开盘: {formatNum(q.open)}</div>
              <div>最高: {formatNum(q.high)}</div>
              <div>最低: {formatNum(q.low)}</div>
              <div>昨收: {formatNum(q.preClose)}</div>
              <div>成交量: {formatNum(q.volume)}</div>
              <div>成交额: {formatNum(q.amount)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}