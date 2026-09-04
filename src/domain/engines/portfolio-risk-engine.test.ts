import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { buildRiskActions, calculatePortfolioMetrics, runStressTests } from "./portfolio-risk-engine";

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
  it("turns limit breaches and data gaps into ordered actions", () => {
    const state = structuredClone(demoState);
    state.settings = { ...state.settings, maxTotalPositionPct: 1, maxSinglePositionPct: 1 };
    state.instruments = state.instruments.map((item) => ({ ...item, sectors: [], styles: [] }));
    const actions = buildRiskActions(state);
    expect(actions[0]).toMatchObject({ id: "total-position", priority: "high" });
    expect(actions.some((item) => item.id.startsWith("single-") && (item.amount ?? 0) > 0)).toBe(true);
    expect(actions.some((item) => item.id === "classification-gap")).toBe(true);
  });
});
