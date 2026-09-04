import { describe, expect, it } from "vitest";
import type { Quote } from "@/domain/model";
import { describeQuote } from "./quote-provenance";

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  instrumentId: "i1", price: 10, previousClose: null, currency: "CNY", marketTime: null,
  fetchedAt: "2026-09-04T00:00:00.000Z", source: "用户上传的持仓截图", freshness: "delayed", isFallback: false,
  ...overrides,
});

describe("describeQuote", () => {
  it("does not present an uploaded screenshot as live market data", () => {
    expect(describeQuote(quote()).label).toBe("截图快照");
  });

  it("labels a delayed public quote with its source and market time", () => {
    const result = describeQuote(quote({ source: "腾讯公开行情", marketTime: "2026-09-04T09:31:00+08:00" }));
    expect(result.label).toBe("延迟行情");
    expect(result.detail).toContain("腾讯公开行情");
  });

  it("falls back to cost only when no usable quote exists", () => {
    expect(describeQuote(quote({ price: null })).label).toBe("成本估算");
  });
});
