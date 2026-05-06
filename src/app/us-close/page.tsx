import { ArrowLeft, CalendarCheck, DatabaseZap, ShieldAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usDailyClose } from "@/data/usDailyClose";
import { usHoldings } from "@/data/portfolio";

const formatUsd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPct = (value: number | null) => value === null ? "待更新" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const operationLines: Record<string, { label: string; line: number; rule: string }> = {
  AMD: { label: "AMD 移动止盈线", line: 380, rule: "收盘价跌破后，第二天优先复核是否锁利润。" },
  ANET: { label: "ANET 止损线", line: 150, rule: "收盘价低于止损线，第二天不补跌，优先风控。" },
  META: { label: "META 核心锚观察线", line: 600, rule: "收盘价守住 600 附近，继续作为美股核心仓观察。" },
};

export default function UsClosePage() {
  const updated = usDailyClose.status === "updated";
  const failed = usDailyClose.status === "failed";
  const statusText = updated ? "已更新" : failed ? "更新失败" : "等待更新";
  const statusVariant = updated ? "success" : failed ? "destructive" : "warning";
  const totalCloseValue = usDailyClose.quotes.reduce((sum, quote) => {
    const holding = usHoldings.find((item) => item.code === quote.symbol);
    return sum + quote.close * (holding?.quantity ?? 0);
  }, 0);

  const watchItems = usDailyClose.quotes
    .filter((quote) => operationLines[quote.symbol])
    .map((quote) => {
      const line = operationLines[quote.symbol];
      const distancePct = ((quote.close - line.line) / quote.close) * 100;
      const triggered = quote.close < line.line;
      return { ...quote, ...line, distancePct, triggered };
    });

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">美股每日收盘价</h1>
              <Badge variant={statusVariant}>{statusText}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">由扣子每日收盘后更新 · GitHub 提交 · Vercel 自动部署</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className={updated ? "border-emerald-200 bg-emerald-50" : failed ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />收盘价更新状态</CardTitle>
            <CardDescription>{usDailyClose.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <MiniMetric label="版本" value={usDailyClose.version} />
            <MiniMetric label="交易日" value={usDailyClose.tradingDate || "等待扣子写入"} />
            <MiniMetric label="更新时间" value={usDailyClose.updatedAt} />
            <MiniMetric label="数据源" value={usDailyClose.source} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />美股持仓收盘市值估算</CardTitle>
            <CardDescription>按收盘价 × 当前静态持仓股数估算，不代表实时账户净值。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="覆盖标的" value={`${usDailyClose.quotes.length} 只`} />
            <MiniMetric label="收盘价估算市值" value={formatUsd(totalCloseValue)} />
            <MiniMetric label="状态" value={statusText} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />操作线触发复核</CardTitle>
            <CardDescription>扣子更新收盘价后，先看 AMD、ANET、META 是否触发纪律线。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {watchItems.map((item) => (
              <div key={item.symbol} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{item.symbol} · {item.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.rule}</p>
                  </div>
                  <Badge variant={item.triggered ? "destructive" : "success"}>{item.triggered ? "已触发" : "未触发"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <MiniMetric label="收盘价" value={formatUsd(item.close)} />
                  <MiniMetric label="纪律线" value={formatUsd(item.line)} />
                  <MiniMetric label="距离" value={`${item.distancePct.toFixed(1)}%`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarCheck className="h-5 w-5" />收盘价明细</CardTitle>
            <CardDescription>扣子以后只需要更新这里对应的数据文件。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {usDailyClose.quotes.map((quote) => {
              const holding = usHoldings.find((item) => item.code === quote.symbol);
              const holdingValue = quote.close * (holding?.quantity ?? 0);
              return (
                <div key={quote.symbol} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{quote.symbol}</p>
                      <p className="text-xs text-slate-500">{quote.name}</p>
                    </div>
                    <Badge variant={quote.changePct !== null && quote.changePct < 0 ? "warning" : "outline"}>{formatPct(quote.changePct)}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <MiniMetric label="收盘价" value={formatUsd(quote.close)} />
                    <MiniMetric label="持仓估值" value={formatUsd(holdingValue)} />
                  </div>
                  {quote.note && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-medium text-slate-600">{quote.note}</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-slate-200/70">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-black text-slate-950">{value}</p>
    </div>
  );
}
