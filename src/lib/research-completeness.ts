import type { AppState, Instrument, ResearchSnapshot } from "@/domain/model";

export type ResearchCompleteness = {
  score: number;
  status: "完整" | "基本完整" | "待补充" | "待核验";
  missing: string[];
  quoteTime: string | null;
  researchTime: string | null;
};

const usefulSymbol = (symbol: string) => Boolean(symbol && !symbol.startsWith("NAME:"));

function latestSnapshot(state: AppState, instrument: Instrument): ResearchSnapshot | null {
  return state.researchSnapshots
    .filter((item) => item.scope === "instrument" && [instrument.id, instrument.symbol, instrument.name].includes(item.subject))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function calculateResearchCompleteness(state: AppState, instrument: Instrument): ResearchCompleteness {
  const quote = state.quotes.find((item) => item.instrumentId === instrument.id) ?? null;
  const snapshot = latestSnapshot(state, instrument);
  const checks: Array<[number, boolean, string]> = [
    [10, usefulSymbol(instrument.symbol) && Boolean(instrument.name), "证券身份与代码"],
    [15, typeof quote?.price === "number" && quote.price > 0, "有效价格"],
    [10, typeof quote?.previousClose === "number" && quote.previousClose > 0, "昨收与涨跌基准"],
    [15, Boolean(quote?.marketTime) && !["stale", "missing"].includes(quote?.freshness ?? "missing"), "行情时间与新鲜度"],
    [10, instrument.sectors.length > 0 || instrument.styles.length > 0, "行业与风格分类"],
    [15, Boolean(snapshot?.positiveEvidence.length), "支持证据"],
    [10, Boolean(snapshot?.negativeEvidence.length), "反方证据"],
    [10, Boolean(snapshot?.invalidation.length), "失效条件"],
    [5, Boolean(snapshot?.dataTime), "研究数据时间"],
  ];
  const score = checks.reduce((sum, [weight, passed]) => sum + (passed ? weight : 0), 0);
  const status = score >= 80 ? "完整" : score >= 60 ? "基本完整" : score >= 40 ? "待补充" : "待核验";
  return {
    score,
    status,
    missing: checks.filter(([, passed]) => !passed).map(([, , label]) => label),
    quoteTime: quote?.marketTime ?? null,
    researchTime: snapshot?.dataTime ?? null,
  };
}
