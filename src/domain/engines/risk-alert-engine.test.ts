import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { synchronizeRiskAlerts } from "@/domain/engines/risk-alert-engine";

describe("risk alert synchronization", () => {
  it("creates deterministic alerts for breached enabled rules", () => {
    const alerts = synchronizeRiskAlerts(demoState, "2026-09-03T08:00:00.000Z");
    expect(alerts).toContainEqual(expect.objectContaining({ id: "rule-risk-single", severity: "critical", resolvedAt: null }));
  });

  it("automatically resolves a generated alert after the breach clears", () => {
    const state = structuredClone(demoState);
    state.alerts = synchronizeRiskAlerts(state, "2026-09-03T08:00:00.000Z");
    state.riskRules = state.riskRules.map((rule) => ({ ...rule, warningThreshold: 100, criticalThreshold: 100 }));
    const alerts = synchronizeRiskAlerts(state, "2026-09-03T09:00:00.000Z");
    expect(alerts.find((alert) => alert.id === "rule-risk-single")?.resolvedAt).toBe("2026-09-03T09:00:00.000Z");
  });
});
