import { ArrowLeft, Activity, DatabaseZap, HeartPulse, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getALiveQuotes } from "@/lib/aLiveApi";
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
      message: "缺少 AKSHARE_API_URL。Render 的 AKShare Python 服务尚未接入 Vercel。",
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
      message: response.ok ? "AKShare Python 服务已连通。" : `AKShare 服务返回 HTTP ${response.status}`,
      checkedAt: `${getBeijingNow()} 北京时间`,
      url: baseUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      ok: false,
      status: "connection_failed",
      message,
      checkedAt: `${getBeijingNow()} 北京时间`,
      url: baseUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function SystemStatusPage() {
  const [usClose, aLive, akHealth] = await Promise.all([
    getUsCloseFromApi(),
    getALiveQuotes(),
    checkAkshareHealth(),
  ]);

  const usOk = usClose.status === "updated";
  const aLiveOk = aLive.status === "updated";
  const allOk = usOk && aLiveOk && akHealth.ok;

  const envRows = [
    {
      name: "TWELVE_DATA_API_KEY",
      status: usOk ? "已生效" : "待检查",
      note: usOk ? "美股收盘价 API 正常。" : "如果美股收盘页显示失败，优先检查这个变量。",
    },
    {
      name: "AKSHARE_API_URL",
      status: process.env.AKSHARE_API_URL ? "已配置" : "未配置",
      note: process.env.AKSHARE_API_URL ? "Vercel 已拿到 Render 服务地址。" : "Render 部署完成后，需要把服务地址填到 Vercel。",
    },
    {
      name: "AKSHARE_SERVICE_TOKEN",
      status: process.env.AKSHARE_SERVICE_TOKEN ? "已配置" : "未配置/可选",
      note: "如果 Render 设置了 token，Vercel 也必须填同一个 token；如果 Render 不强制 token，可不填。",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">系统状态</h1>
              <Badge variant={allOk ? "success" : "warning"}>{allOk ? "全部正常" : "部分待接入"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">统一检查美股收盘、A股盘中、AKShare 服务和环境变量。</p>
          </div>
          <a href="/" className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-slate-50">
            <ArrowLeft className="mr-1 h-4 w-4" />返回
          </a>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            icon="us"
            title="美股收盘"
            ok={usOk}
            status={usClose.status}
            description={usClose.description}
            meta={[`数据源：${usClose.source}`, `交易日：${usClose.tradingDate || "-"}`, `更新时间：${usClose.updatedAt}`]}
            href="/us-close"
          />
          <StatusCard
            icon="a"
            title="A股盘中"
            ok={aLiveOk}
            status={aLive.status}
            description={aLive.disclaimer}
            meta={[`数据源：${aLive.source}`, `覆盖：${aLive.quoteCount || aLive.quotes.length} 只`, `更新时间：${aLive.updatedAt || "-"}`]}
            href="/a-live"
          />
          <StatusCard
            icon="health"
            title="AKShare 服务"
            ok={akHealth.ok}
            status={akHealth.status}
            description={akHealth.message}
            meta={[`地址：${akHealth.url ?? "未配置"}`, `检查：${akHealth.checkedAt}`]}
            href="/api/a-live/health"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5" />环境变量检查</CardTitle>
            <CardDescription>这里告诉你还缺哪一步，不需要记复杂配置。</CardDescription>
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

        <Card className="border-blue-100 bg-blue-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />下一步动作</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-700">
            <p>1. 美股收盘已经打通，核心看 /us-close。</p>
            <p>2. A股盘中需要先在 Render 部署 akshare-service。</p>
            <p>3. Render 部署完成后，把服务地址填入 Vercel：AKSHARE_API_URL。</p>
            <p>4. 回到本页，看到 AKShare 服务“已连通”后，/a-live 就能显示实时观察行情。</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  ok,
  status,
  description,
  meta,
  href,
  icon,
}: {
  title: string;
  ok: boolean;
  status: string;
  description: string;
  meta: string[];
  href: string;
  icon: "us" | "a" | "health";
}) {
  const Icon = icon === "health" ? HeartPulse : icon === "a" ? DatabaseZap : Activity;

  return (
    <Card className={ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-700">状态</span>
          <Badge variant={ok ? "success" : "warning"}>{status}</Badge>
        </div>
        <div className="grid gap-1 text-slate-600">
          {meta.map((item) => <p key={item}>{item}</p>)}
        </div>
        <a href={href} className="inline-flex rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm">打开</a>
      </CardContent>
    </Card>
  );
}
