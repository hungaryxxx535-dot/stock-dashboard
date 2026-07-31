import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import {
  applyScreenshotImport,
  isValidMarketSymbol,
  normalizeSymbol,
  parseBrokerScreenshotText,
  type ScreenshotHoldingDraft,
} from "./screenshot";

describe("broker screenshot portfolio import", () => {
  it("parses A-share, US and Hong Kong rows using market-specific symbols", () => {
    const cn = parseBrokerScreenshotText("600519 贵州茅台 100 1450.00 1500.00 150000.00", "CN");
    const us = parseBrokerScreenshotText("Apple Inc AAPL 10 180.00 195.00 1950.00", "US");
    const hk = parseBrokerScreenshotText("00700 腾讯控股 100 350.00 380.00 38000.00", "HK");

    expect(cn.rows[0]).toMatchObject({ symbol: "600519", name: "贵州茅台", quantity: 100, brokerCost: 1450, currentPrice: 1500 });
    expect(us.rows[0]).toMatchObject({ symbol: "AAPL", name: "Apple Inc", quantity: 10, brokerCost: 180, currentPrice: 195 });
    expect(hk.rows[0]).toMatchObject({ symbol: "00700", name: "腾讯控股", quantity: 100, brokerCost: 350, currentPrice: 380 });
  });

  it("normalizes symbols without mixing market rules", () => {
    expect(normalizeSymbol("SH600519", "CN")).toBe("600519");
    expect(normalizeSymbol("700.HK", "HK")).toBe("00700");
    expect(normalizeSymbol("nasdaq:aapl", "US")).toBe("AAPL");
    expect(isValidMarketSymbol("00700", "HK")).toBe(true);
    expect(isValidMarketSymbol("AAPL", "CN")).toBe(false);
  });

  it("imports one market without closing holdings from that or other markets", () => {
    const row: ScreenshotHoldingDraft = {
      symbol: "AAPL",
      name: "Apple",
      quantity: 8,
      brokerCost: 185,
      currentPrice: 195,
      marketValue: 1560,
      confidence: 95,
      warnings: [],
    };
    let sequence = 0;
    const next = applyScreenshotImport(structuredClone(demoState), "US", [row], {
      now: "2026-07-31T12:00:00.000Z",
      idFactory: () => `generated-${++sequence}`,
    });

    const aShareHoldingCount = demoState.holdings.filter((holding) =>
      demoState.instruments.find((instrument) => instrument.id === holding.instrumentId)?.market === "CN"
    ).length;
    const nextAShareHoldingCount = next.holdings.filter((holding) =>
      next.instruments.find((instrument) => instrument.id === holding.instrumentId)?.market === "CN"
    ).length;
    const importedInstrument = next.instruments.find((instrument) => instrument.market === "US" && instrument.symbol === "AAPL");
    const importedHolding = next.holdings.find((holding) => holding.instrumentId === importedInstrument?.id);

    expect(nextAShareHoldingCount).toBe(aShareHoldingCount);
    expect(importedHolding).toMatchObject({ quantity: 8, brokerCost: 185, economicCost: 185, status: "open" });
    expect(next.snapshots).toHaveLength(demoState.snapshots.length + 1);
    expect(next.importJobs.at(-1)).toMatchObject({ format: "broker_image", status: "confirmed", rawRowCount: 1 });
    expect(next.dataVersions.at(-1)?.source).toBe("import");
  });

  it("rejects an invalid market symbol before changing state", () => {
    const invalid: ScreenshotHoldingDraft = {
      symbol: "AAPL",
      name: "Apple",
      quantity: 1,
      brokerCost: 1,
      currentPrice: 1,
      marketValue: 1,
      confidence: 90,
      warnings: [],
    };
    expect(() => applyScreenshotImport(structuredClone(demoState), "CN", [invalid])).toThrow("证券代码");
    expect(demoState.snapshots).toHaveLength(0);
  });
});
