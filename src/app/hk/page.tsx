import { ArrowLeft, DatabaseZap, Landmark, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const hkHoldings: Array<{
  name: string;
  code: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  currency: "HKD";
  note: string;
}> = [];

const formatHkd = (value: number) => `HK$${value.toLocaleString("zh-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function HkPage() {
  const totalValue = hkHoldings.reduce((sum, item) => sum + item.quantity * item.currentPrice, 0);
  const totalCost = hkHoldings.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">港股持仓</h1>
              <Badge variant="warning">待录入</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">港股模块已预留；持仓数量和成本价来自手动维护，后续可接入港股行情自动估算盈亏。</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className="border-blue-100 bg-blue-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />数据口径</CardTitle>
            <CardDescription>港股和 A股、美股一样，采用“持仓底表 + 行情价格”的模式。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <MiniMetric label="持仓来源" value="手动维护/截图录入" />
            <MiniMetric label="行情来源" value="待接入港股行情" />
            <MiniMetric label="交易能力" value="不自动下单" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />港股组合估算</CardTitle>
            <CardDescription>录入港股持仓后，这里会展示市值、成本、浮盈亏和收益率。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <MiniMetric label="持仓数量" value={`${hkHoldings.length} 只`} />
            <MiniMetric label="估算市值" value={formatHkd(totalValue)} />
            <MiniMetric label="估算成本" value={formatHkd(totalCost)} />
            <MiniMetric label="估算盈亏" value={`${pnl >= 0 ? "+" : ""}${formatHkd(pnl)} / ${pnlPct.toFixed(2)}%`} />
          </CardContent>
        </Card>

        {hkHoldings.length === 0 ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />暂无港股持仓</CardTitle>
              <CardDescription>你把港股持仓截图发给我后，我会把代码、数量、成本价录入到底表里。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-amber-800">
              <p>需要截图里能看到：股票名称/代码、持仓数量、成本价、现价、市值、浮盈亏。</p>
              <p>无交易变动时，后续只刷新行情；有买卖变动时再更新持仓底表。</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>港股持仓明细</CardTitle>
              <CardDescription>按港股持仓底表展示。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {hkHoldings.map((item) => {
                const value = item.quantity * item.currentPrice;
                const cost = item.quantity * item.costPrice;
                const itemPnl = value - cost;
                return (
                  <div key={item.code} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.code}</p>
                      </div>
                      <Badge variant={itemPnl >= 0 ? "success" : "warning"}>{itemPnl >= 0 ? "浮盈" : "浮亏"}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <MiniMetric label="持仓数量" value={item.quantity.toLocaleString("zh-CN")} />
                      <MiniMetric label="现价" value={formatHkd(item.currentPrice)} />
                      <MiniMetric label="成本价" value={formatHkd(item.costPrice)} />
                      <MiniMetric label="估算市值" value={formatHkd(value)} />
                      <MiniMetric label="估算盈亏" value={`${itemPnl >= 0 ? "+" : ""}${formatHkd(itemPnl)}`} />
                      <MiniMetric label="备注" value={item.note} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
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
