import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import {
  applyScreenshotImport,
  findMatchingInstrument,
  isNameOnlySymbol,
  isValidMarketSymbol,
  normalizeSymbol,
  parseBrokerScreenshotOcr,
  parseBrokerScreenshotText,
  type OcrWord,
  type ScreenshotHoldingDraft,
} from "./screenshot";

function tsv(words: OcrWord[]): string {
  const header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  return [header, ...words.map((word, index) =>
    `5\t1\t1\t1\t${index + 1}\t1\t${word.left}\t${word.top}\t${word.width}\t${word.height}\t${word.confidence}\t${word.text}`
  )].join("\n");
}

function word(text: string, left: number, top: number, width = 90): OcrWord {
  return { text, left, top, width, height: 24, confidence: 94 };
}

describe("broker screenshot portfolio import", () => {
  it("keeps the one-line parser as a fallback for market-specific symbols", () => {
    const cn = parseBrokerScreenshotText("600001 示例制造 100 12.50 13.20 1320.00", "CN");
    const us = parseBrokerScreenshotText("Sample Network SNET 8 42.00 48.00 384.00", "US");
    const hk = parseBrokerScreenshotText("01234 示例消费 200 18.00 19.50 3900.00", "HK");

    expect(cn.rows[0]).toMatchObject({ symbol: "600001", name: "示例制造", quantity: 100, brokerCost: 12.5, currentPrice: 13.2 });
    expect(us.rows[0]).toMatchObject({ symbol: "SNET", name: "Sample Network", quantity: 8, brokerCost: 42, currentPrice: 48 });
    expect(hk.rows[0]).toMatchObject({ symbol: "01234", name: "示例消费", quantity: 200, brokerCost: 18, currentPrice: 19.5 });
  });

  it("rebuilds a Futu-style row when the name and US symbol are on separate visual lines", () => {
    const words = [
      word("名称代码", 35, 100), word("市值/数量", 330, 100), word("现价/成本", 580, 100), word("今日盈亏", 800, 100),
      word("Sample", 35, 200), word("Robotics", 130, 200), word("2,400.00", 340, 200), word("48.000", 590, 200), word("+12.0", 810, 200),
      word("SROB", 35, 235), word("50", 400, 235), word("44.500", 610, 235),
    ];
    const result = parseBrokerScreenshotOcr(words.map((item) => item.text).join("\n"), tsv(words), "US");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ symbol: "SROB", name: "Sample Robotics", quantity: 50, brokerCost: 44.5, currentPrice: 48, marketValue: 2400 });
  });

  it("rebuilds a Ping-An-style A-share row without requiring a code", () => {
    const words = [
      word("市值", 25, 100), word("盈亏", 205, 100), word("持仓/可用", 345, 100), word("成本/现价", 485, 100),
      word("示例芯片", 25, 200), word("+88.00", 205, 200), word("1200", 375, 200), word("7.500", 500, 200),
      word("9360.00", 25, 235), word("+0.95%", 205, 235), word("1200", 375, 235), word("7.800", 500, 235),
    ];
    const result = parseBrokerScreenshotOcr(words.map((item) => item.text).join("\n"), tsv(words), "CN");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ symbol: "", name: "示例芯片", quantity: 1200, brokerCost: 7.5, currentPrice: 7.8, marketValue: 9360 });
    expect(result.rows[0].warnings).toContain("截图未显示代码，将优先按名称匹配");
  });

  it("normalizes symbols without mixing market rules", () => {
    expect(normalizeSymbol("SH600001", "CN")).toBe("600001");
    expect(normalizeSymbol("1234.HK", "HK")).toBe("01234");
    expect(normalizeSymbol("nasdaq:snet", "US")).toBe("SNET");
    expect(isValidMarketSymbol("01234", "HK")).toBe(true);
    expect(isValidMarketSymbol("SNET", "CN")).toBe(false);
  });

  it("matches an existing instrument by normalized name when the screenshot has no code", () => {
    const match = findMatchingInstrument(demoState.instruments, "CN", { symbol: "", name: "示例成长" });
    expect(match?.id).toBe("demo-a1");
  });

  it("imports a name-only holding and gives unmatched names a stable internal identity", () => {
    const row: ScreenshotHoldingDraft = {
      symbol: "",
      name: "示例新能源",
      quantity: 80,
      brokerCost: 25,
      currentPrice: 27,
      marketValue: 2160,
      confidence: 91,
      warnings: ["截图未显示代码，将优先按名称匹配"],
    };
    let sequence = 0;
    const next = applyScreenshotImport(structuredClone(demoState), "CN", [row], {
      now: "2026-07-31T12:00:00.000Z",
      idFactory: () => `generated-${++sequence}`,
    });
    const importedInstrument = next.instruments.find((instrument) => instrument.name === "示例新能源");
    const importedHolding = next.holdings.find((holding) => holding.instrumentId === importedInstrument?.id);

    expect(isNameOnlySymbol(importedInstrument?.symbol ?? "")).toBe(true);
    expect(importedHolding).toMatchObject({ quantity: 80, brokerCost: 25, economicCost: 25, status: "open" });
    expect(importedHolding?.tags).toContain("名称待匹配");
    expect(next.snapshots).toHaveLength(demoState.snapshots.length + 1);
    expect(next.importJobs.at(-1)).toMatchObject({ format: "broker_image", status: "confirmed", rawRowCount: 1 });
  });

  it("updates an existing holding through a name match without creating a duplicate instrument", () => {
    const before = structuredClone(demoState);
    const existing = before.instruments.find((instrument) => instrument.id === "demo-a1");
    expect(existing).toBeDefined();
    const row: ScreenshotHoldingDraft = {
      symbol: "",
      name: "示例成长",
      quantity: 321,
      brokerCost: 9.8,
      currentPrice: 10.2,
      marketValue: 3274.2,
      confidence: 88,
      warnings: [],
    };
    let sequence = 0;
    const next = applyScreenshotImport(before, "CN", [row], { idFactory: () => `name-match-${++sequence}` });
    const matchedHolding = next.holdings.find((holding) => holding.instrumentId === existing?.id && holding.status === "open");

    expect(next.instruments).toHaveLength(demoState.instruments.length);
    expect(matchedHolding?.quantity).toBe(321);
    expect(matchedHolding?.tags).toContain("名称匹配");
  });

  it("still rejects a row without a usable name or quantity", () => {
    const invalid: ScreenshotHoldingDraft = {
      symbol: "",
      name: "",
      quantity: 0,
      brokerCost: 1,
      currentPrice: 1,
      marketValue: 1,
      confidence: 20,
      warnings: [],
    };
    expect(() => applyScreenshotImport(structuredClone(demoState), "CN", [invalid])).toThrow("证券名称");
    expect(demoState.snapshots).toHaveLength(0);
  });
});
