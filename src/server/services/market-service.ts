import { extendMarketIntelligence } from "@/lib/market-intelligence/extended";
import { applyResilientFallbacks } from "@/lib/market-intelligence/resilient";
import { getMarketIntelligence } from "@/lib/market-intelligence/server";
import type { SourceStatus } from "@/lib/market-intelligence/types";
import type { MarketCard, UnifiedMarketSnapshot } from "@/lib/data-providers/market-types";

const catalog = [
  ["sh", "上证指数", "点"],
  ["hs300", "沪深300", "点"],
  ["cyb", "创业板", "点"],
  ["star50", "科创50", "点"],
  ["hsi", "恒生指数", "点"],
  ["hstech", "恒生科技", "点"],
  ["sp500", "标普500", "点"],
  ["nasdaq", "纳斯达克", "点"],
  ["dow", "道琼斯", "点"],
  ["vixcls", "VIX", "点"],
  ["dgs2", "美债2年期", "%"],
  ["dgs10", "美债10年期", "%"],
  ["us_2s10s", "期限利差", "百分点"],
  ["dtwexbgs", "美元指数", "点"],
  ["gold", "黄金", "美元/盎司"],
  ["oil", "原油", "美元/桶"],
  ["usdcny", "人民币汇率", "CNY/USD"],
] as const;

function mapState(status: SourceStatus["status"]) {
  if (status === "online") return "online" as const;
  if (status === "partial") return "partial" as const;
  if (status === "not_configured") return "not_configured" as const;
  return "error" as const;
}

export async function getUnifiedMarketSnapshot(): Promise<UnifiedMarketSnapshot> {
  const base = await getMarketIntelligence();
  const extended = await extendMarketIntelligence(base);
  const payload = await applyResilientFallbacks(extended);
  const fetchedAt = payload.generatedAt || new Date().toISOString();

  const cards: MarketCard[] = catalog.map(([id, name, unit]) => {
    const index = payload.indices.find((item) => item.name === name || item.code.toLowerCase().includes(id));
    const macro = payload.macro.find((item) => item.id.toLowerCase() === id);
    const value = index?.close ?? macro?.value ?? null;
    const marketTime = index?.tradeDate ?? macro?.period ?? null;
    const source = index?.source ?? macro?.source ?? "尚未接入";
    return {
      id,
      name,
      value,
      changePct: index?.pctChange ?? null,
      unit,
      source,
      marketTime,
      fetchedAt,
      delayed: !marketTime,
      cached: false,
      fallback: source.includes("公开") || source.includes("东方财富") || source.includes("Google"),
      status: value === null ? "missing" : "available",
    };
  });

  const statuses = payload.sourceStatus.map((status) => ({
    id: status.id,
    name: status.name,
    state: mapState(status.status),
    source: status.name,
    marketTime: null,
    fetchedAt: status.updatedAt,
    delayed: status.status !== "online",
    cached: false,
    fallback: status.id.includes("eastmoney") || status.id.includes("google") || status.id.includes("public"),
    message: status.message,
  }));
  const available = cards.filter((card) => card.value !== null).length;
  return {
    generatedAt: fetchedAt,
    cards,
    news: payload.news,
    statuses,
    warnings: payload.warnings,
    confidence: Math.round((available / cards.length) * 100),
  };
}
