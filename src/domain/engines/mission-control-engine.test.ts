import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { buildMissionControl } from "@/domain/engines/mission-control-engine";

const now = new Date("2026-06-01T02:00:00.000Z");

describe("mission control engine", () => {
  it("blocks price decisions when every open holding lacks reliable quotes", () => {
    const result = buildMissionControl(demoState, now);
    expect(result.status).toBe("blocked");
    expect(result.items[0].id).toBe("data-all-unreliable");
    expect(result.readinessScore).toBeLessThanOrEqual(60);
  });

  it("promotes critical risk breaches ahead of informational tasks", () => {
    const state = structuredClone(demoState);
    state.quotes = state.quotes.map((quote) => ({ ...quote, price: 100, freshness: "live" as const, marketTime: now.toISOString() }));
    state.riskRules[0] = { ...state.riskRules[0], warningThreshold: 1, criticalThreshold: 2 };
    const result = buildMissionControl(state, now);
    expect(result.status).toBe("risk_first");
    expect(result.items[0].source).toBe("risk");
  });

  it("flags expired plans and links them to plan handling", () => {
    const state = structuredClone(demoState);
    state.quotes = state.quotes.map((quote) => ({ ...quote, price: 100, freshness: "live" as const, marketTime: now.toISOString() }));
    state.riskRules = [];
    state.tradePlans[0].validUntil = "2026-05-20T00:00:00.000Z";
    const result = buildMissionControl(state, now);
    expect(result.items).toContainEqual(expect.objectContaining({ id: "plan-expired-plan-demo", severity: "critical", href: "/plans" }));
  });

  it("returns ready when only a review reminder remains", () => {
    const state = structuredClone(demoState);
    state.holdings = [];
    state.tradePlans = [];
    state.riskRules = [];
    const result = buildMissionControl(state, now);
    expect(result.status).toBe("ready");
    expect(result.counts.info).toBeGreaterThan(0);
  });
});
