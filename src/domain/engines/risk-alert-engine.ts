import type { Alert, AppState } from "@/domain/model";
import { calculatePortfolioMetrics } from "@/domain/engines/portfolio-risk-engine";

export function synchronizeRiskAlerts(state: AppState, now = new Date().toISOString()): Alert[] {
  const metrics = calculatePortfolioMetrics(state);
  const values: Record<string, number | undefined> = { totalPositionPct: metrics.totalPositionPct, maxSinglePositionPct: metrics.largestHoldingPct, largestHoldingPct: metrics.largestHoldingPct, technologyExposurePct: metrics.technologyExposurePct, topThreePct: metrics.topThreePct };
  const generatedIds = new Set(state.riskRules.map((rule) => `rule-${rule.id}`));
  const result = state.alerts.filter((alert) => !generatedIds.has(alert.id));
  for (const rule of state.riskRules) {
    const id = `rule-${rule.id}`;
    const existing = state.alerts.find((alert) => alert.id === id);
    const value = values[rule.metric];
    const active = rule.enabled && value !== undefined && value >= rule.warningThreshold;
    if (!active) {
      if (existing) result.push({ ...existing, resolvedAt: existing.resolvedAt ?? now });
      continue;
    }
    const critical = value >= rule.criticalThreshold;
    result.push({ id, severity: critical ? "critical" : "warning", title: `${rule.name}${critical ? "达到严重线" : "触发预警"}`, reason: `当前 ${value.toFixed(1)}%，预警线 ${rule.warningThreshold}%，严重线 ${rule.criticalThreshold}%。`, impactAmount: null, impactPct: value, reviewAction: "复核组合并建立风险处置计划", planId: null, createdAt: existing?.createdAt ?? now, resolvedAt: existing?.resolvedAt ?? null });
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
