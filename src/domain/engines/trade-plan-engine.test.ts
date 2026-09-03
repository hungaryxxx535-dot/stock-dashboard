import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { canTransitionPlan, transitionTradePlan } from "@/domain/engines/trade-plan-engine";

describe("trade plan state machine", () => {
  it("allows the audited draft-to-waiting path", () => {
    const plan = { ...demoState.tradePlans[0], status: "draft" as const };
    const updated = transitionTradePlan(plan, "waiting", "2026-09-03T08:00:00.000Z");
    expect(updated.status).toBe("waiting");
    expect(updated.updatedAt).toBe("2026-09-03T08:00:00.000Z");
  });

  it("rejects skipping from draft directly to actionable", () => {
    const plan = { ...demoState.tradePlans[0], status: "draft" as const };
    expect(canTransitionPlan("draft", "actionable")).toBe(false);
    expect(() => transitionTradePlan(plan, "actionable")).toThrow(/不能从 draft/);
  });

  it("keeps terminal plans terminal", () => {
    expect(canTransitionPlan("completed", "actionable")).toBe(false);
    expect(canTransitionPlan("invalidated", "waiting")).toBe(false);
  });
});
