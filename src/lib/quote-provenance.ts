import type { Quote } from "@/domain/model";

export type QuoteProvenance = {
  label: string;
  detail: string;
  tone: "good" | "warning" | "danger";
};

const formatTime = (value: string | null) => {
  if (!value) return "价格时点未提供";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
};

export function describeQuote(quote: Quote | null): QuoteProvenance {
  if (!quote?.price) return { label: "成本估算", detail: "缺少有效价格", tone: "danger" };
  const source = quote.source || "来源未标注";
  if (/截图|跨设备持仓|云端持仓/.test(source)) {
    return { label: "截图快照", detail: `${source} · ${formatTime(quote.marketTime)}`, tone: "warning" };
  }
  if (quote.freshness === "live") return { label: "实时行情", detail: `${source} · ${formatTime(quote.marketTime)}`, tone: "good" };
  if (quote.freshness === "delayed") return { label: "延迟行情", detail: `${source} · ${formatTime(quote.marketTime)}`, tone: "warning" };
  if (quote.freshness === "cached") return { label: "缓存行情", detail: `${source} · ${formatTime(quote.marketTime)}`, tone: "warning" };
  return { label: "过期行情", detail: `${source} · ${formatTime(quote.marketTime)}`, tone: "danger" };
}
