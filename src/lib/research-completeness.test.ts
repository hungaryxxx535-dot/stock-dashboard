import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { calculateResearchCompleteness } from "./research-completeness";

describe("calculateResearchCompleteness", () => {
  it("reports concrete missing evidence instead of a hard-coded status", () => {
    const instrument = demoState.instruments[0];
    const result = calculateResearchCompleteness(demoState, instrument);
    expect(result.score).toBeLessThan(60);
    expect(result.missing).toContain("支持证据");
    expect(result.missing).toContain("昨收与涨跌基准");
  });

  it("reaches complete when quote and both sides of research are present", () => {
    const state = structuredClone(demoState);
    const instrument = state.instruments[0];
    state.quotes[0] = { ...state.quotes[0], price: 10, previousClose: 9.8, marketTime: "2026-09-04T10:00:00+08:00", freshness: "delayed", source: "腾讯公开行情" };
    state.researchSnapshots.push({ id: "r1", subject: instrument.id, scope: "instrument", score: 70, confidence: 70, dataTime: "2026-09-04T10:00:00+08:00", createdAt: "2026-09-04T10:01:00+08:00", positiveEvidence: ["e"], negativeEvidence: ["c"], missingData: [], invalidation: ["i"], conclusion: "观察" });
    expect(calculateResearchCompleteness(state, instrument).status).toBe("完整");
  });
});
