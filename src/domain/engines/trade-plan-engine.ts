import type { TradePlan } from "@/domain/model";

const transitions: Record<TradePlan["status"], TradePlan["status"][]> = {
  draft: ["waiting", "cancelled"],
  waiting: ["actionable", "invalidated", "cancelled"],
  actionable: ["partially_executed", "completed", "invalidated", "cancelled"],
  partially_executed: ["actionable", "completed", "invalidated", "cancelled"],
  completed: [],
  invalidated: [],
  cancelled: [],
};

export function canTransitionPlan(from: TradePlan["status"], to: TradePlan["status"]): boolean {
  return transitions[from].includes(to);
}

export function transitionTradePlan(plan: TradePlan, next: TradePlan["status"], now = new Date().toISOString()): TradePlan {
  if (!canTransitionPlan(plan.status, next)) throw new Error(`交易计划不能从 ${plan.status} 变更为 ${next}`);
  return { ...plan, status: next, updatedAt: now };
}
