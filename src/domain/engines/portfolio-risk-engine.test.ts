import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { calculatePortfolioMetrics, runStressTests } from "./portfolio-risk-engine";

describe("portfolio risk engine", () => {
  it("separates broker position from total capital position", () => {
    const metrics = calculatePortfolioMetrics(demoState);
    expect(metrics.brokerPositionPct).toBeGreaterThan(metrics.totalPositionPct);
  });
  it("keeps negative economic cost finite", () => {
    const state = structuredClone(demoState);
    state.holdings[0].economicCost = -1;
    expect(Number.isFinite(calculatePortfolioMetrics(state).valuations[0].pnlBase)).toBe(true);
  });
  it("excludes closed positions and calculates all stress scenarios", () => {
    const state = structuredClone(demoState);
    state.holdings[0].status = "closed";
    const metrics = calculatePortfolioMetrics(state);
    expect(metrics.valuations.some((item) => item.holding.id === state.holdings[0].id)).toBe(false);
    expect(runStressTests(state, metrics)).toHaveLength(8);
  });
});
