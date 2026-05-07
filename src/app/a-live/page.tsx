import { ArrowLeft, DatabaseZap, HeartPulse, ShieldAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aShareHoldings } from "@/data/portfolio";
import { getALiveQuotes, type ALiveData, type ALiveQuote } from "@/lib/aLiveApi";

export const dynamic = "force-dynamic";

type HealthData = {
  ok: boolean;
  status: string;
  message?: string;
  akshareApiUrl?: string;
  upstreamStatus?: number;
  checkedAt: string;
};

const formatPrice = (value: number | null) => (value === null ? "-" : value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
const formatPct = (value: number | null) => (value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`);
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

const operationLines: Record<string, { label: string; line: number; rule: string }> = {
  "688008": { label: "澜起科技移动止盈线", line: 185, rule: "跌破后第二天优先复核是否锁部分利润。" },
  "588750": { label: "科创芯50观察位", line: 2.05, rule: "跌破后重点看科技集中度是否需要降。" },
  "600036": { label: "招商银行防守观察位", line: 37.5, rule: "防守仓主要看稳定器作用，不和科技仓一起乱动。" },
};

export default async function ALivePage() {
  const healthData = await getHealthStatus();
  let liveData: ALiveData;
  try {
    liveData = await getALiveQuotes();
  } catch {
    liveData = {
      status: "failed",
      source: "未知",
      updatedAt: "",
      quoteCount: 0,
      quotes: [],
      disclaimer: "A股行情数据不可用。",
    };
  }

  const updated = liveData.status === "updated";
  const totalTrackedValue = liveData.quotes.reduce((sum, quote) => {
    const holding = aShareHoldings.find((item) => item.code === quote.symbol);
    return sum + (quote.price ?? holding?.currentPrice ?? 0) * (holding?.quantity ?? 0);
  }, 0);

  const triggeredItems = liveData.quotes
    .filter((quote) => operationLines[quote.symbol])
    .map((quote) => {
      const line = operationLines[quote.symbol];
      const price = quote.price ?? 0;
      const triggered = price > 0 && price < line.line;
      const distancePct = price > 0 ? ((price - line.line) / price) * 100 : 0;
      return { ...quote, ...line, triggered, distancePct };
    });

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">A股盘中观察</h1>
              <Badge variant={updated ? "success" : "destructive"}>{updated ? "已连接" : "静态回退"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">AKShare / 东方财富公开行情 · 仅用于盘中观察</p>
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
            <MiniMetric label="前端动作" value={healthData.ok ? "读取实时观察数据" : "使用静态回退"} />
          </CardContent>
        </Card>

        <Card className={updated ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />行情连接状态</CardTitle>
            <CardDescription>{liveData.disclaimer}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <MiniMetric label="状态" value={updated ? "AKShare 已连接" : "静态持仓回退"} />
            <MiniMetric label="更新时间" value={liveData.updatedAt || "-"} />
            <MiniMetric label="数据源" value={liveData.source} />
            <MiniMetric label="覆盖标的" value={`${liveData.quoteCount || liveData.quotes.length} 只`} />
            <MiniMetric label="缓存" value={liveData.cacheHit ? "命中缓存" : "最新请求"} />
            <MiniMetric label="追踪市值估算" value={`¥${Math.round(totalTrackedValue).toLocaleString("zh-CN")}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />操作线触发复核</CardTitle>
            <CardDescription>先看澜起、科创芯50、招商银行三个关键锚点。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {triggeredItems.map((item) => (
              <div key={item.symbol} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{item.symbol} · {item.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.label}：{item.rule}</p>
                  </div>
                  <Badge variant={item.triggered ? "destructive" : "success"}>{item.triggered ? "已触发" : "未触发"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <MiniMetric label="最新价" value={formatPrice(item.price)} />
                  <MiniMetric label="纪律线" value={formatPrice(item.line)} />
                  <MiniMetric label="距离" value={`${item.distancePct.toFixed(1)}%`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />核心持仓行情</CardTitle>
            <CardDescription>当前只覆盖主仓和重点观察仓；失败时自动回退到静态持仓。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {liveData.quotes.map((quote) => <QuoteCard key={quote.symbol} quote={quote} />)}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function QuoteCard({ quote }: { quote: ALiveQuote }) {
  const positive = (quote.changePct ?? 0) >= 0;
  const holding = aShareHoldings.find((item) => item.code === quote.symbol);
  const estimatedValue = (quote.price ?? holding?.currentPrice ?? 0) * (holding?.quantity ?? 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{quote.name}</p>
          <p className="text-xs text-slate-500">{quote.symbol} · {quote.type} · {quote.role ?? ""}</p>
        </div>
        <Badge variant={quote.error ? "warning" : positive ? "success" : "destructive"}>{quote.error ? "回退" : formatPct(quote.changePct)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="最新价" value={formatPrice(quote.price)} />
        <MiniMetric label="涨跌额" value={formatPrice(quote.change)} />
        <MiniMetric label="涨跌幅" value={formatPct(quote.changePct)} />
        <MiniMetric label="今开" value={formatPrice(quote.open)} />
        <MiniMetric label="最高" value={formatPrice(quote.high)} />
        <MiniMetric label="最低" value={formatPrice(quote.low)} />
        <MiniMetric label="成交额" value={formatAmount(quote.amount)} />
        <MiniMetric label="成交量" value={formatAmount(quote.volume)} />
        <MiniMetric label="估算市值" value={`¥${Math.round(estimatedValue).toLocaleString("zh-CN")}`} />
      </div>
      {quote.error && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-medium text-amber-800">该标的当前使用静态持仓回退，不是实时行情。</p>}
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
