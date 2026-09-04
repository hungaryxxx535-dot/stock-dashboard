import { describe, expect, it } from "vitest";
import { parseTencentPortfolioQuotes } from "./portfolio-quotes.server";

describe("parseTencentPortfolioQuotes", () => {
  it("parses price, previous close and exchange time", () => {
    const text = 'v_sh600036="51~招商银行~600036~41.20~40.80~40.90~~~~~~~~~~~~~~~~~~~~~~~~~20260904103122~";';
    const result = parseTencentPortfolioQuotes(text, [{ market: "CN", symbol: "600036", providerCode: "sh600036" }]);
    expect(result[0]).toMatchObject({ symbol: "600036", price: 41.2, previousClose: 40.8 });
    expect(result[0].marketTime).toBe("2026-09-04T10:31:22+08:00");
  });
});
