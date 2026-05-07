import { ArrowLeft, CalendarCheck, DatabaseZap, ShieldAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usDailyClose } from "@/data/usDailyClose";
import { usHoldings } from "@/data/portfolio";
import { getUsCloseFromApi } from "@/lib/usCloseApi";

const formatUsd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPct = (value: number | null) => value === null ? "待更新" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const operationLines: Record<string, { label: string; line: number; rule: string }> = {
  AMD: { label: "AMD 移动止盈线", line: 380, rule: "收盘价跌破后，第二天优先复核是否锁利润。" },
  ANET: { label: "ANET 止损线", line: 150, rule: "收盘价低于止损线，第二天不补跌，优先风控。" },
  META: { label: "META 核心锚观察线", line: 600, rule: "收盘价守住 600 附近，继续作为美股核心仓观察。" },
};

export const dynamic = "force-dynamic";

export default async function UsClosePage() {
  let dailyCloseData = usDailyClose;

  try {
    dailyCloseData = await getUsCloseFromApi();
  } catch {
    dailyCloseData = usDailyClose;
  }

  const updated = dailyCloseData.status === "updated";
  const failed = dailyCloseData.status === "failed";
  const statusText = updated ? "已更新" : failed ? "更新失败" : "等待更新";
  const statusVariant = updated ? "success" : failed ? "destructive" : "warning";

  const tracked = dailyCloseData.quotes.map((quote) => {
    const holding = usHoldings.find((item) => item.code === quote.symbol);
    const quantity = holding?.quantity ?? 0;
    const costPrice = holding?.costPrice ?? 0;
    const holdingValue = quote.close * quantity;
    const costAmount = costPrice * quantity;
    const pnl = holdingValue - costAmount;
    const pnlPct = costAmount > 0 ? (pnl / costAmount) * 100 : null;
    return { quote, holding, quantity, costPrice, holdingValue, costAmount, pnl, pnlPct };
  });

  const totalCloseValue = tracked.reduce((sum, item) => sum + item.holdingValue, 0);
  const totalCostAmount = tracked.reduce((sum, item) => sum + item.costAmount, 0);
  const totalPnl = totalCloseValue - totalCostAmount;
  const totalPnlPct = totalCostAmount > 0 ? (totalPnl / totalCostAmount) * 100 : null;

  const watchItems = dailyCloseData.quotes
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
            <p className="mt-1 text-sm text-slate-500">收盘价自动匹配手动持仓数量和成本价，生成估算市值与浮盈亏。</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className={updated ? "border-emerald-200 bg-emerald-50" : failed ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />收盘价更新状态</CardTitle>
            <CardDescription>{dailyCloseData.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <MiniMetric label="版本" value={dailyCloseData.version} />
            <MiniMetric label="交易日" value={dailyCloseData.tradingDate || "等待更新"} />
            <MiniMetric label="更新时间" value={dailyCloseData.updatedAt} />
            <MiniMetric label="数据源" value={dailyCloseData.source} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />美股持仓收盘盈亏估算</CardTitle>
            <CardDescription>持仓数量和成本价来自手动维护清单；收盘价由接口更新，失败时回退本地占位。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="覆盖标的" value={`${dailyCloseData.quotes.length} 只`} />
            <MiniMetric label="收盘价估算市值" value={formatUsd(totalCloseValue)} />
            <MiniMetric label="估算成本" value={formatUsd(totalCostAmount)} />
            <MiniMetric label="自动估算盈亏" value={`${totalPnl >= 0 ? "+" : ""}${formatUsd(totalPnl)}`} />
            <MiniMetric label="估算收益率" value={formatPct(totalPnlPct)} />
            <MiniMetric label="状态" value={statusText} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />操作线触发复核</CardTitle>
            <CardDescription>收盘后查看 AMD、ANET、META 是否触发纪律线。</CardDescription>
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
            <CardTitle className="flex items-center gap-2"><CalendarCheck className="h-5 w-5" />收盘价与盈亏明细</CardTitle>
            <CardDescription>价格自动更新后，系统按收盘价 × 持仓数量重新估算市值和浮盈亏。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {tracked.map((item) => {
              const quote = item.quote;
              return (
                <div key={quote.symbol} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{quote.symbol}</p>
                      <p className="text-xs text-slate-500">{quote.name}</p>
                    </div>
                    <Badge variant={item.pnl >= 0 ? "success" : "warning"}>{item.pnl >= 0 ? "浮盈" : "浮亏"}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <MiniMetric label="收盘价" value={formatUsd(quote.close)} />
                    <MiniMetric label="持仓数量" value={`${item.quantity} 股`} />
                    <MiniMetric label="成本价" value={formatUsd(item.costPrice)} />
                    <MiniMetric label="持仓估值" value={formatUsd(item.holdingValue)} />
                    <MiniMetric label="估算盈亏" value={`${item.pnl >= 0 ? "+" : ""}${formatUsd(item.pnl)}`} />
                    <MiniMetric label="估算收益率" value={formatPct(item.pnlPct)} />
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
