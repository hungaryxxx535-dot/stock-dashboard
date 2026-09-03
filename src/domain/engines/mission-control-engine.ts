import type { AppState } from "@/domain/model";
import { calculatePortfolioMetrics } from "@/domain/engines/portfolio-risk-engine";

export type MissionSeverity = "blocker" | "critical" | "warning" | "info";

export type MissionItem = {
  id: string;
  severity: MissionSeverity;
  title: string;
  reason: string;
  actionLabel: string;
  href: string;
  source: "data" | "risk" | "plan" | "review" | "alert";
};

export type MissionControl = {
  readinessScore: number;
  status: "blocked" | "risk_first" | "review_required" | "ready";
  statusLabel: string;
  command: string;
  items: MissionItem[];
  counts: Record<MissionSeverity, number>;
};

const activePlanStatuses = new Set(["draft", "waiting", "actionable", "partially_executed"]);
const severityOrder: Record<MissionSeverity, number> = { blocker: 0, critical: 1, warning: 2, info: 3 };

export function buildMissionControl(state: AppState, now = new Date()): MissionControl {
  const metrics = calculatePortfolioMetrics(state);
  const items: MissionItem[] = [];
  const openInstrumentIds = new Set(state.holdings.filter((holding) => holding.status === "open" && holding.quantity > 0).map((holding) => holding.instrumentId));
  const unreliableQuotes = [...openInstrumentIds].filter((instrumentId) => {
    const quote = state.quotes.find((item) => item.instrumentId === instrumentId);
    return !quote || quote.price === null || ["stale", "missing"].includes(quote.freshness);
  });

  if (openInstrumentIds.size === 0) {
    items.push({ id: "data-no-holdings", severity: "info", title: "建立持仓基线", reason: "当前没有开放持仓，无法生成组合级作战指令。", actionLabel: "导入持仓", href: "/portfolio/import", source: "data" });
  } else if (unreliableQuotes.length === openInstrumentIds.size) {
    items.push({ id: "data-all-unreliable", severity: "blocker", title: "行情数据不可用于决策", reason: `${unreliableQuotes.length} 项开放持仓全部缺少可靠价格，价格相关动作应暂停。`, actionLabel: "检查数据源", href: "/system-status", source: "data" });
  } else if (unreliableQuotes.length > 0) {
    items.push({ id: "data-partial", severity: "warning", title: "补齐持仓行情", reason: `${unreliableQuotes.length}/${openInstrumentIds.size} 项持仓价格缺失或过期，组合指标含估算。`, actionLabel: "查看持仓", href: "/portfolio", source: "data" });
  }

  const metricValues: Record<string, number | undefined> = {
    totalPositionPct: metrics.totalPositionPct,
    maxSinglePositionPct: metrics.largestHoldingPct,
    largestHoldingPct: metrics.largestHoldingPct,
    technologyExposurePct: metrics.technologyExposurePct,
    topThreePct: metrics.topThreePct,
  };
  for (const rule of state.riskRules.filter((item) => item.enabled)) {
    const value = metricValues[rule.metric];
    if (value === undefined || value < rule.warningThreshold) continue;
    const critical = value >= rule.criticalThreshold;
    items.push({
      id: `risk-${rule.id}`,
      severity: critical ? "critical" : "warning",
      title: `${rule.name}${critical ? "达到严重线" : "触发预警"}`,
      reason: `当前 ${value.toFixed(1)}%，预警线 ${rule.warningThreshold}%，严重线 ${rule.criticalThreshold}%。`,
      actionLabel: "制定风险计划",
      href: "/risk",
      source: "risk",
    });
  }

  for (const plan of state.tradePlans.filter((item) => activePlanStatuses.has(item.status))) {
    const instrument = state.instruments.find((item) => item.id === plan.instrumentId);
    const symbol = instrument?.symbol ?? "未知标的";
    const expiresAt = new Date(plan.validUntil).getTime();
    const daysLeft = Math.ceil((expiresAt - now.getTime()) / 86_400_000);
    if (Number.isFinite(expiresAt) && daysLeft < 0) {
      items.push({ id: `plan-expired-${plan.id}`, severity: "critical", title: `计划已过期：${symbol}`, reason: `计划有效期已过 ${Math.abs(daysLeft)} 天，必须复核或标记失效后才能继续。`, actionLabel: "处理计划", href: "/plans", source: "plan" });
    } else if (Number.isFinite(expiresAt) && daysLeft <= 3) {
      items.push({ id: `plan-expiring-${plan.id}`, severity: "warning", title: `计划即将到期：${symbol}`, reason: `剩余 ${Math.max(0, daysLeft)} 天，请确认条件与失效标准仍然成立。`, actionLabel: "复核计划", href: "/plans", source: "plan" });
    } else if (plan.status === "actionable") {
      items.push({ id: `plan-actionable-${plan.id}`, severity: "info", title: `计划条件待核验：${symbol}`, reason: "计划已进入可执行状态，仍需核对行情、风险预算与失效条件。", actionLabel: "核验计划", href: "/plans", source: "plan" });
    }
  }

  for (const alert of state.alerts.filter((item) => item.resolvedAt === null && !item.id.startsWith("rule-"))) {
    items.push({ id: `alert-${alert.id}`, severity: alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "info", title: alert.title, reason: alert.reason, actionLabel: "查看风险", href: alert.planId ? "/plans" : "/risk", source: "alert" });
  }

  const today = now.toLocaleDateString("en-CA", { timeZone: state.settings.timezone });
  const journaledToday = state.journalEntries.some((entry) => new Date(entry.executedAt).toLocaleDateString("en-CA", { timeZone: state.settings.timezone }) === today);
  if (!journaledToday) items.push({ id: "review-today", severity: "info", title: "记录今日决策", reason: "今天还没有执行或观察记录，收盘后会缺少可复盘证据。", actionLabel: "写复盘", href: "/journal", source: "review" });

  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.id.localeCompare(b.id));
  const counts = items.reduce<Record<MissionSeverity, number>>((result, item) => ({ ...result, [item.severity]: result[item.severity] + 1 }), { blocker: 0, critical: 0, warning: 0, info: 0 });
  const readinessScore = Math.max(0, 100 - counts.blocker * 40 - counts.critical * 25 - counts.warning * 10);
  if (counts.blocker) return { readinessScore, status: "blocked", statusLabel: "暂停决策", command: "数据闸门未通过：暂停价格相关决策，先恢复可靠行情。", items, counts };
  if (counts.critical) return { readinessScore, status: "risk_first", statusLabel: "风险优先", command: "先处理严重风险或过期计划，再考虑新增动作。", items, counts };
  if (counts.warning) return { readinessScore, status: "review_required", statusLabel: "需要复核", command: "当前可以观察，但必须先完成预警项复核。", items, counts };
  return { readinessScore, status: "ready", statusLabel: "可以按计划", command: "数据与风险闸门未发现阻断项，只执行已验证的计划。", items, counts };
}
