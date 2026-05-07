import { ArrowLeft, DatabaseZap, HeartPulse, Landmark, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getHkLiveQuotes, type HkHoldingBase, type HkLiveQuote } from "@/lib/hkLiveApi";

export const dynamic = "force-dynamic";

const hkHoldings: HkHoldingBase[] = [
  { name: "建设银行", code: "00939", quantity: 1000, costPrice: 5.191, currentPrice: 8.88, currency: "HKD", note: "港股合并口径，按截图录入。" },
  { name: "腾讯控股", code: "00700", quantity: 700, costPrice: 544.598, currentPrice: 477.4, currency: "HKD", note: "合并口径：平安账户600股 + 富途账户100股；成本价为加权成本。" },
  { name: "小米集团-W", code: "01810", quantity: 2200, costPrice: 59.102, currentPrice: 31.12, currency: "HKD", note: "港股合并口径，按截图录入。" },
  { name: "中国心连心化肥", code: "01866", quantity: 1000, costPrice: 11.5, currentPrice: 12.6, currency: "HKD", note: "港股合并口径，按截图录入。" },
  { name: "南方两倍做多", code: "07709", quantity: 100, costPrice: 23.68, currentPrice: 76.88, currency: "HKD", note: "港股杠杆/做多类标的，波动较大，单独观察。" },
];

const formatHkd = (value: number | null) => value === null ? "-" : `HK$${value.toLocaleString("zh-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPct = (value: number | null) => value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const formatAmount = (value: number | null) => {
  if (value === null) return "-";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)} 亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(2)} 万`;
  return value.toLocaleString("zh-CN");
};

const getBeijingNow = () =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

type HealthData = {
  ok: boolean;
  status: string;
  message?: string;
  akshareApiUrl?: string;
  upstreamStatus?: number;
  checkedAt: string;
};

async function getHealthStatus(): Promise<HealthData> {
  const baseUrl = process.env.AKSHARE_API_URL;
  const token = process.env.AKSHARE_SERVICE_TOKEN;

  if (!baseUrl) {
    return {
      ok: false,
      status: "missing_env",
      message: "缺少 AKSHARE_API_URL，Render 的 AKShare Python 服务尚未接入。",
      checkedAt: `${getBeijingNow()} 北京时间`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { "x-service-token": token } : undefined,
    });

    return {
      ok: response.ok,
      status: response.ok ? "connected" : "upstream_error",
      akshareApiUrl: baseUrl,
      upstreamStatus: response.status,
      checkedAt: `${getBeijingNow()} 北京时间`,
      message: response.ok ? "AKShare Python 服务已连通。" : `AKShare 服务返回 HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      ok: false,
      status: "connection_failed",
      akshareApiUrl: baseUrl,
      message,
      checkedAt: `${getBeijingNow()} 北京时间`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function HkPage() {
  const healthData = await getHealthStatus();
  const liveData = await getHkLiveQuotes(hkHoldings);
  const updated = liveData.status === "updated";

  const tracked = hkHoldings.map((holding) => {
    const quote = liveData.quotes.find((item) => item.symbol === holding.code);
    const price = quote?.price ?? holding.currentPrice;
    const value = price * holding.quantity;
    const cost = holding.costPrice * holding.quantity;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : null;
    return { holding, quote, price, value, cost, pnl, pnlPct };
  });

  const totalValue = tracked.reduce((sum, item) => sum + item.value, 0);
  const totalCost = tracked.reduce((sum, item) => sum + item.cost, 0);
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : null;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">港股持仓</h1>
              <Badge variant={updated ? "success" : hkHoldings.length > 0 ? "warning" : "outline"}>{updated ? "AKShare 已连接" : hkHoldings.length > 0 ? "持仓快照回退" : "待录入"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">港股共用 AKShare 服务；当前按一个港股大模块合并展示，行情接入后自动估算盈亏。</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <Card className={healthData.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5" />AKShare 服务健康检查</CardTitle>
            <CardDescription>{healthData.message ?? "服务状态检查完成。"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <MiniMetric label="服务状态" value={healthData.ok ? "已连通" : "未连通"} />
            <MiniMetric label="状态码" value={healthData.status} />
            <MiniMetric label="检查时间" value={healthData.checkedAt} />
            <MiniMetric label="Render 地址" value={healthData.akshareApiUrl ?? "未配置"} />
            <MiniMetric label="上游 HTTP" value={healthData.upstreamStatus ? String(healthData.upstreamStatus) : "-"} />
            <MiniMetric label="港股接口" value="/api/hk/spot" />
          </CardContent>
        </Card>

        <Card className={updated ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />港股行情连接状态</CardTitle>
            <CardDescription>{liveData.disclaimer}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <MiniMetric label="状态" value={updated ? "AKShare 港股已连接" : "港股持仓快照回退"} />
            <MiniMetric label="更新时间" value={liveData.updatedAt || "-"} />
            <MiniMetric label="数据源" value={liveData.source} />
            <MiniMetric label="覆盖标的" value={`${liveData.quoteCount || liveData.quotes.length} 只`} />
            <MiniMetric label="缓存" value={liveData.cacheHit ? "命中缓存" : "最新请求"} />
            <MiniMetric label="接口说明" value="共用 AKShare 服务" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />港股组合估算</CardTitle>
            <CardDescription>当前已把不同账户里的同名股票合并为一个港股组合口径。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <MiniMetric label="持仓标的" value={`${hkHoldings.length} 只`} />
            <MiniMetric label="估算市值" value={formatHkd(totalValue)} />
            <MiniMetric label="估算成本" value={formatHkd(totalCost)} />
            <MiniMetric label="估算盈亏" value={`${pnl >= 0 ? "+" : ""}${formatHkd(pnl)} / ${formatPct(pnlPct)}`} />
          </CardContent>
        </Card>

        {hkHoldings.length === 0 ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />暂无港股持仓</CardTitle>
              <CardDescription>港股接口已经按 AKShare 共用方案接好。你把港股持仓截图发给我后，我会把代码、数量、成本价录入到底表里。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-amber-800">
              <p>需要截图里能看到：股票名称/代码、持仓数量、成本价、现价、市值、浮盈亏。</p>
              <p>无交易变动时，后续只刷新港股页；有买卖变动时再更新持仓底表。</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>港股持仓明细</CardTitle>
              <CardDescription>按合并后的港股持仓底表 + AKShare 港股行情估算。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {tracked.map((item) => <HoldingCard key={item.holding.code} item={item} />)}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function HoldingCard({ item }: { item: { holding: HkHoldingBase; quote?: HkLiveQuote; price: number; value: number; cost: number; pnl: number; pnlPct: number | null } }) {
  const quote = item.quote;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{item.holding.name}</p>
          <p className="text-xs text-slate-500">{item.holding.code}</p>
        </div>
        <Badge variant={quote?.error ? "warning" : item.pnl >= 0 ? "success" : "destructive"}>{quote?.error ? "回退" : item.pnl >= 0 ? "浮盈" : "浮亏"}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <MiniMetric label="持仓数量" value={item.holding.quantity.toLocaleString("zh-CN")} />
        <MiniMetric label="最新价" value={formatHkd(item.price)} />
        <MiniMetric label="成本价" value={formatHkd(item.holding.costPrice)} />
        <MiniMetric label="涨跌幅" value={formatPct(quote?.changePct ?? null)} />
        <MiniMetric label="成交额" value={formatAmount(quote?.amount ?? null)} />
        <MiniMetric label="估算市值" value={formatHkd(item.value)} />
        <MiniMetric label="估算盈亏" value={`${item.pnl >= 0 ? "+" : ""}${formatHkd(item.pnl)}`} />
        <MiniMetric label="估算收益率" value={formatPct(item.pnlPct)} />
      </div>
      {item.holding.note && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-medium text-slate-600">{item.holding.note}</p>}
    </div>
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
