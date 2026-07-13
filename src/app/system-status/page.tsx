import { ArrowLeft, Activity, DatabaseZap, Globe2, HeartPulse, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getALiveQuotes } from "@/lib/aLiveApi";
import { extendMarketIntelligence } from "@/lib/market-intelligence/extended";
import { applyResilientFallbacks } from "@/lib/market-intelligence/resilient";
import { getMarketIntelligence } from "@/lib/market-intelligence/server";
import { getUsCloseFromApi } from "@/lib/usCloseApi";

export const dynamic = "force-dynamic";

type HealthStatus = {
  ok: boolean;
  status: string;
  message: string;
  checkedAt: string;
  url?: string;
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

async function checkAkshareHealth(): Promise<HealthStatus> {
  const baseUrl = process.env.AKSHARE_API_URL;
  const token = process.env.AKSHARE_SERVICE_TOKEN;

  if (!baseUrl) {
    return {
      ok: false,
      status: "missing_env",
      message: "缺少AKSHARE_API_URL，A股实时盘面无法进入市场评分。",
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
      message: response.ok ? "AKShare Python服务已连通。" : `AKShare服务返回HTTP ${response.status}`,
      checkedAt: `${getBeijingNow()} 北京时间`,
      url: baseUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return { ok: false, status: "connection_failed", message, checkedAt: `${getBeijingNow()} 北京时间`, url: baseUrl };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkMarketIntelligence() {
  try {
    const base = await getMarketIntelligence();
    const extended = await extendMarketIntelligence(base);
    const payload = await applyResilientFallbacks(extended);
    const usableSources = payload.sourceStatus.filter((item) => item.status === "online" || item.status === "partial");
    return {
      ok: payload.regime.score !== null,
      status: payload.regime.score !== null ? "ready" : "insufficient",
      message:
        payload.regime.score !== null
          ? `市场环境分${payload.regime.score}，已获得${payload.indices.length}项指数、${payload.macro.length}项宏观指标和${payload.news.length}条新闻。`
          : payload.regime.reasons.join("；") || "外部数据仍不足。",
      checkedAt: `${getBeijingNow()} 北京时间`,
      sourceCount: usableSources.length,
      sources: payload.sourceStatus,
      warnings: payload.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "市场情报检查失败",
      checkedAt: `${getBeijingNow()} 北京时间`,
      sourceCount: 0,
      sources: [],
      warnings: [],
    };
  }
}

export default async function SystemStatusPage() {
  const [usClose, aLive, akHealth, marketHealth] = await Promise.all([
    getUsCloseFromApi(),
    getALiveQuotes(),
    checkAkshareHealth(),
    checkMarketIntelligence(),
  ]);

  const usOk = usClose.status === "updated";
  const aLiveOk = aLive.status === "updated";
  const allOk = usOk && marketHealth.ok;
  const envRows = [
    {
      name: "TWELVE_DATA_API_KEY",
      status: usOk ? "已生效" : "待检查",
      note: usOk ? "美股收盘价API正常。" : "美股收盘页失败时优先检查此变量。",
    },
    {
      name: "AKSHARE_API_URL",
      status: process.env.AKSHARE_API_URL ? "已配置" : "未配置",
      note: process.env.AKSHARE_API_URL ? "A股持仓实时盘面可以参与判断。" : "缺少后，A股分析只能依赖指数、宏观和新闻。",
    },
    {
      name: "TUSHARE_TOKEN",
      status: process.env.TUSHARE_TOKEN ? "已配置" : "未配置",
      note: process.env.TUSHARE_TOKEN ? "中国PMI、CPI、PPI、Shibor和北向资金可读取。" : "这正是中国宏观和资金面经常显示缺失的主要原因。",
    },
    {
      name: "FRED_API_KEY",
      status: process.env.FRED_API_KEY ? "已配置" : "未配置/可选",
      note: "未配置时会尝试FRED官方公开CSV；如果Vercel访问失败，海外利率和VIX也会缺失。",
    },
    {
      name: "免密钥回退",
      status: "已启用",
      note: "A股指数使用东方财富公开行情，新闻使用GDELT并回退Google News RSS。",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">系统状态</h1>
              <Badge variant={allOk ? "success" : "warning"}>{allOk ? "核心功能正常" : "部分数据待接入"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">检查行情、宏观、新闻、环境变量和数据回退链路。</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard icon="us" title="美股收盘" ok={usOk} status={usClose.status} description={usClose.description} meta={[`数据源：${usClose.source}`, `交易日：${usClose.tradingDate || "-"}`, `更新时间：${usClose.updatedAt}`]} href="/us-close" />
          <StatusCard icon="a" title="A股盘中" ok={aLiveOk} status={aLive.status} description={aLive.disclaimer} meta={[`数据源：${aLive.source}`, `覆盖：${aLive.quoteCount || aLive.quotes.length}只`, `更新时间：${aLive.updatedAt || "-"}`]} href="/a-live" />
          <StatusCard icon="health" title="AKShare服务" ok={akHealth.ok} status={akHealth.status} description={akHealth.message} meta={[`地址：${akHealth.url ?? "未配置"}`, `检查：${akHealth.checkedAt}`]} href="/api/a-live/health" />
          <StatusCard icon="market" title="市场情报" ok={marketHealth.ok} status={marketHealth.status} description={marketHealth.message} meta={[`可用来源：${marketHealth.sourceCount}`, `检查：${marketHealth.checkedAt}`]} href="/intelligence" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" />市场情报来源诊断</CardTitle>
            <CardDescription>直接显示哪个来源在线、未配置或异常。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {marketHealth.sources.length ? marketHealth.sources.map((source) => (
              <div key={source.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{source.name}</p>
                  <Badge variant={source.status === "online" ? "success" : source.status === "partial" ? "warning" : "outline"}>{source.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{source.message}</p>
              </div>
            )) : <p className="text-sm text-slate-500">尚未获得来源状态。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5" />环境变量检查</CardTitle>
            <CardDescription>“数据不足”通常不是分析算法没有运行，而是上游数据源没有返回足够证据。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {envRows.map((row) => (
              <div key={row.name} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{row.name}</p>
                  <Badge variant={row.status.includes("已") ? "success" : "warning"}>{row.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{row.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {marketHealth.warnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-amber-900"><Activity className="h-5 w-5" />本次检查警告</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-amber-800">
              {marketHealth.warnings.slice(0, 12).map((warning) => <p key={warning}>• {warning}</p>)}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function StatusCard({ title, ok, status, description, meta, href, icon }: { title: string; ok: boolean; status: string; description: string; meta: string[]; href: string; icon: "us" | "a" | "health" | "market" }) {
  const Icon = icon === "health" ? HeartPulse : icon === "a" ? DatabaseZap : icon === "market" ? Globe2 : Activity;
  return (
    <Card className={ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3"><span className="font-bold text-slate-700">状态</span><Badge variant={ok ? "success" : "warning"}>{status}</Badge></div>
        <div className="grid gap-1 text-slate-600">{meta.map((item) => <p key={item}>{item}</p>)}</div>
        <a href={href} className="inline-flex rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm">打开</a>
      </CardContent>
    </Card>
  );
}
