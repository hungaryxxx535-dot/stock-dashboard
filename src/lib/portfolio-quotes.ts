import type { AppState, Quote } from "@/domain/model";

export type PublicPortfolioQuote = {
  market: "CN" | "HK" | "US";
  symbol: string;
  price: number;
  previousClose: number | null;
  marketTime: string | null;
  source: string;
};

export type PortfolioQuoteResponse = {
  status: "updated" | "partial" | "failed";
  fetchedAt: string;
  source: string;
  quotes: PublicPortfolioQuote[];
  missing: string[];
  message: string;
};

const targetKey = (market: string, symbol: string) => `${market}:${symbol.toUpperCase()}`;

export function buildPortfolioQuoteTargets(state: AppState): string[] {
  const openIds = new Set(state.holdings.filter((item) => item.status === "open" && item.quantity > 0).map((item) => item.instrumentId));
  return state.instruments
    .filter((item) => openIds.has(item.id) && item.market !== "CASH" && (item.market !== "CN" || /^\d{6}$/.test(item.symbol)))
    .map((item) => targetKey(item.market, item.symbol));
}

export function mergePortfolioQuotes(state: AppState, payload: PortfolioQuoteResponse): AppState {
  if (!payload.quotes.length) return {
    ...state,
    dataSourceStatuses: [
      ...state.dataSourceStatuses.filter((item) => item.id !== "portfolio-public-quotes"),
      { id: "portfolio-public-quotes", name: "持仓公开行情", state: "error", source: payload.source, marketTime: null, fetchedAt: payload.fetchedAt, delayed: true, cached: false, fallback: false, message: payload.message },
    ],
  };
  const byTarget = new Map(payload.quotes.map((item) => [targetKey(item.market, item.symbol), item]));
  const quotes = [...state.quotes];
  for (const instrument of state.instruments) {
    const incoming = byTarget.get(targetKey(instrument.market, instrument.symbol));
    if (!incoming) continue;
    const next: Quote = {
      instrumentId: instrument.id,
      price: incoming.price,
      previousClose: incoming.previousClose,
      currency: instrument.currency,
      marketTime: incoming.marketTime,
      fetchedAt: payload.fetchedAt,
      source: incoming.source,
      freshness: "delayed",
      isFallback: false,
    };
    const index = quotes.findIndex((item) => item.instrumentId === instrument.id);
    if (index >= 0) quotes[index] = next;
    else quotes.push(next);
  }
  return {
    ...state,
    quotes,
    updatedAt: payload.fetchedAt,
    dataSourceStatuses: [
      ...state.dataSourceStatuses.filter((item) => item.id !== "portfolio-public-quotes"),
      { id: "portfolio-public-quotes", name: "持仓公开行情", state: payload.status === "updated" ? "online" : "partial", source: payload.source, marketTime: payload.quotes.map((item) => item.marketTime).filter(Boolean).sort().at(-1) ?? null, fetchedAt: payload.fetchedAt, delayed: true, cached: false, fallback: false, message: payload.message },
    ],
  };
}
