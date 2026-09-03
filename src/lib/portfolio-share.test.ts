import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { createPortfolioShareUrl, decodePortfolioShare, encodePortfolioShare } from "@/lib/portfolio-share";

describe("portfolio share links", () => {
  it("round-trips open holdings without plans or journals", () => {
    const source = structuredClone(demoState);
    source.quotes[0].price = 12.34;
    const restored = decodePortfolioShare(encodePortfolioShare(source));
    expect(restored.mode).toBe("local");
    expect(restored.holdings).toHaveLength(source.holdings.length);
    expect(restored.quotes.find((quote) => quote.price === 12.34)).toBeTruthy();
    expect(restored.tradePlans).toEqual([]);
    expect(restored.journalEntries).toEqual([]);
  });

  it("creates a URL fragment and rejects damaged data", () => {
    expect(createPortfolioShareUrl(demoState, "https://example.com/")).toMatch(/^https:\/\/example\.com\/#portfolio=/);
    expect(() => decodePortfolioShare("damaged")).toThrow();
  });
});
