import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { buildPortfolioQuoteTargets, mergePortfolioQuotes, type PortfolioQuoteResponse } from "./portfolio-quotes";

describe("portfolio quote enrichment", () => {
  it("builds targets only for open supported instruments", () => {
    const state = structuredClone(demoState);
    state.instruments[0].symbol = "600036";
    state.instruments[2].symbol = "AMD";
    expect(buildPortfolioQuoteTargets(state)).toContain("CN:600036");
    expect(buildPortfolioQuoteTargets(state)).toContain("US:AMD");
  });

  it("replaces a screenshot quote with attributable delayed market data", () => {
    const payload: PortfolioQuoteResponse = { status: "updated", fetchedAt: "2026-09-04T02:00:00.000Z", source: "腾讯公开行情", missing: [], message: "已更新", quotes: [{ market: "CN", symbol: "600000", price: 12, previousClose: 11.8, marketTime: "2026-09-04T10:00:00+08:00", source: "腾讯公开行情（延迟）" }] };
    const state = structuredClone(demoState);
    state.instruments[0].symbol = "600000";
    const next = mergePortfolioQuotes(state, payload);
    expect(next.quotes.find((item) => item.instrumentId === "demo-a1")).toMatchObject({ price: 12, previousClose: 11.8, source: "腾讯公开行情（延迟）" });
  });
});
