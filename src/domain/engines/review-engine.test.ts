import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import type { AppState } from "@/domain/model";
import { buildPeriodReview } from "./review-engine";

const DAY_MS = 86_400_000;
const now = new Date("2026-08-01T12:00:00.000Z");
const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS).toISOString();

function baseState(): AppState {
  return structuredClone(demoState) as AppState;
}

describe("period review engine", () => {
  it("reports missing baseline when no snapshot exists in or before the period", () => {
    const review = buildPeriodReview(baseState(), "weekly", { now, id: "review-1" });
    expect(review.type).toBe("weekly");
    expect(review.portfolio.startValue).toBeNull();
    expect(review.dataQuality.some((item) => item.includes("快照"))).toBe(true);
    expect(review.title).toContain("周复盘");
  });

  it("uses the latest snapshot at or before the period start as baseline", () => {
    const state = baseState();
    state.snapshots = [
      {
        id: "snap-old", versionId: "v1", createdAt: iso(20), reason: "old",
        holdings: state.holdings.map((holding) => ({ ...holding, quantity: holding.quantity - 10 })),
        cashBalances: [], transactions: [],
      },
      {
        id: "snap-recent", versionId: "v1", createdAt: iso(8), reason: "recent",
        holdings: state.holdings.map((holding) => ({ ...holding, quantity: holding.quantity - 1 })),
        cashBalances: [], transactions: [],
      },
    ];
    const review = buildPeriodReview(state, "weekly", { now, id: "review-2" });
    expect(review.portfolio.startValue).not.toBeNull();
    expect(review.portfolio.changePct).not.toBeNull();
    expect(review.holdings.every((holding) => holding.startQuantity === holding.endQuantity - 1)).toBe(true);
    expect(review.dataQuality).not.toContain("期内没有可用于期初对比的快照");
  });

  it("classifies added, removed, changed and unchanged holdings", () => {
    const state = baseState();
    const [first, second] = state.holdings;
    state.snapshots = [{
      id: "snap", versionId: "v1", createdAt: iso(1), reason: "baseline",
      holdings: state.holdings
        .filter((holding) => holding.id !== second.id)
        .map((holding) => ({ ...holding, quantity: holding.id === first.id ? holding.quantity - 5 : holding.quantity })),
      cashBalances: [], transactions: [],
    }];
    const review = buildPeriodReview(state, "weekly", { now, id: "review-3" });
    const byInstrument = new Map(review.holdings.map((holding) => [holding.instrumentId, holding.status]));
    expect(byInstrument.get(first.instrumentId)).toBe("changed");
    expect(byInstrument.get(second.instrumentId)).toBe("added");
    expect([...byInstrument.values()]).toContain("unchanged");
    expect([...byInstrument.values()]).not.toContain("removed");
  });

  it("counts plans and journal entries only inside the period", () => {
    const state = baseState();
    state.tradePlans = [
      { ...state.tradePlans[0], id: "plan-new", createdAt: iso(1), updatedAt: iso(1), status: "waiting" },
      { ...state.tradePlans[0], id: "plan-completed", createdAt: iso(2), updatedAt: iso(1), status: "completed" },
      { ...state.tradePlans[0], id: "plan-old", createdAt: iso(30), updatedAt: iso(30), status: "waiting" },
    ];
    state.journalEntries = [
      {
        id: "j1", instrumentId: state.instruments[0].id, planId: null, originalThesis: "遵守计划", plannedAction: "a", actualAction: "a",
        executedAt: iso(2), price: 10, quantity: 1, pnl: 5, followedPlan: true, processQuality: "correct", resultQuality: "profit",
        strengths: [], mistakes: [], emotion: "平静", lessons: ["纪律第一"], nextRules: [], attachmentRefs: [],
      },
      {
        id: "j2", instrumentId: state.instruments[0].id, planId: null, originalThesis: "偏离计划", plannedAction: "a", actualAction: "b",
        executedAt: iso(20), price: 10, quantity: 1, pnl: -3, followedPlan: false, processQuality: "incorrect", resultQuality: "loss",
        strengths: [], mistakes: ["追涨"], emotion: "急躁", lessons: [], nextRules: [], attachmentRefs: [],
      },
    ];
    const review = buildPeriodReview(state, "weekly", { now, id: "review-4" });
    expect(review.plans.created).toBe(2);
    expect(review.plans.completed).toBe(1);
    expect(review.plans.active).toBe(1);
    expect(review.journal.count).toBe(1);
    expect(review.journal.followedPlan).toBe(1);
    expect(review.journal.resultProfit).toBe(1);
    expect(review.journal.lessons).toEqual(["纪律第一"]);
  });

  it("flags risk rule breaches in the review", () => {
    const state = baseState();
    state.settings = { ...state.settings, maxTotalPositionPct: 0.1 };
    const review = buildPeriodReview(state, "monthly", { now, id: "review-5" });
    expect(review.risk.warnings.some((warning) => warning.includes("总仓位"))).toBe(true);
  });
});
