import type { AppState, Review } from "@/domain/model";
import { calculatePortfolioMetrics } from "./portfolio-risk-engine";

const DAY_MS = 86_400_000;

export type ReviewOptions = {
  now?: Date;
  id?: string;
  marketSummary?: { summary: string; notes: string[]; source: string };
};

function money(value: number | null): string {
  if (value === null) return "—";
  return Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * Builds an auditable weekly or monthly review from the data already stored in
 * the browser: import snapshots (period-start baseline), current holdings and
 * quotes (period-end), trade plans, journal entries and risk settings. Every
 * estimate or missing baseline is called out explicitly in dataQuality.
 */
export function buildPeriodReview(state: AppState, type: "weekly" | "monthly", options: ReviewOptions = {}): Review {
  const now = options.now ?? new Date();
  const periodDays = type === "weekly" ? 7 : 30;
  const periodStart = new Date(now.getTime() - periodDays * DAY_MS);
  const isoStart = periodStart.toISOString();
  const isoEnd = now.toISOString();

  const orderedSnapshots = [...state.snapshots].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const atOrBeforeStart = [...orderedSnapshots].reverse().find((snapshot) => snapshot.createdAt <= isoStart);
  const earliestInPeriod = orderedSnapshots.find((snapshot) => snapshot.createdAt >= isoStart && snapshot.createdAt <= isoEnd);
  const startSnapshot = atOrBeforeStart ?? earliestInPeriod ?? null;

  const dataQuality: string[] = [];
  if (!startSnapshot) dataQuality.push("期内没有可用于期初对比的快照，期初市值与持仓变化缺失。");
  else if (!atOrBeforeStart) dataQuality.push("期初无快照，期初状态按期内最早快照估算。");
  if (state.quotes.some((quote) => !quote.price)) dataQuality.push("部分持仓缺少有效行情，市值按经济成本估算。");

  const endMetrics = calculatePortfolioMetrics(state);
  const startMetrics = startSnapshot
    ? calculatePortfolioMetrics({
        ...state,
        holdings: startSnapshot.holdings,
        cashBalances: startSnapshot.cashBalances,
        transactions: startSnapshot.transactions,
      })
    : null;

  const startValue = startMetrics?.investedValue ?? null;
  const endValue = endMetrics.investedValue;
  const changePct = startValue !== null && startValue > 0 ? ((endValue - startValue) / startValue) * 100 : null;
  const portfolioNote = startValue === null
    ? "期末市值按当前行情或经济成本估算；期初市值缺失，无法计算变化。"
    : "期初市值按快照持仓 × 当前行情估算（历史价格未留存），期末按当前行情估算。";

  const startMap = new Map(
    (startSnapshot?.holdings ?? [])
      .filter((holding) => holding.status === "open" && holding.quantity > 0)
      .map((holding) => [holding.instrumentId, holding.quantity]),
  );
  const currentOpen = state.holdings.filter((holding) => holding.status === "open" && holding.quantity > 0);
  const currentMap = new Map(currentOpen.map((holding) => [holding.instrumentId, holding.quantity]));
  const instrumentOf = (id: string) => state.instruments.find((instrument) => instrument.id === id);
  const quoteOf = (id: string) => state.quotes.find((quote) => quote.instrumentId === id)?.price ?? null;

  const holdings = [...new Set([...startMap.keys(), ...currentMap.keys()])]
    .map((instrumentId) => {
      const instrument = instrumentOf(instrumentId);
      const startQuantity = startMap.get(instrumentId) ?? null;
      const endQuantity = currentMap.get(instrumentId) ?? 0;
      const status: Review["holdings"][number]["status"] = startQuantity === null
        ? "added"
        : endQuantity === 0
          ? "removed"
          : endQuantity === startQuantity
            ? "unchanged"
            : "changed";
      return {
        instrumentId,
        symbol: instrument?.symbol ?? instrumentId,
        name: instrument?.name ?? instrumentId,
        market: instrument?.market ?? "",
        startQuantity,
        endQuantity,
        startPrice: null,
        endPrice: quoteOf(instrumentId),
        status,
      };
    })
    .sort((left, right) => {
      const order: Record<Review["holdings"][number]["status"], number> = { changed: 0, added: 1, removed: 2, unchanged: 3 };
      return order[left.status] - order[right.status];
    });

  const touchedPlans = state.tradePlans.filter(
    (plan) => (plan.createdAt >= isoStart && plan.createdAt <= isoEnd) || (plan.updatedAt >= isoStart && plan.updatedAt <= isoEnd),
  );
  const activeStatuses = new Set(["draft", "waiting", "actionable"]);
  const plans = {
    created: touchedPlans.filter((plan) => plan.createdAt >= isoStart && plan.createdAt <= isoEnd).length,
    completed: touchedPlans.filter((plan) => plan.status === "completed").length,
    invalidated: touchedPlans.filter((plan) => plan.status === "invalidated" || plan.status === "cancelled").length,
    active: touchedPlans.filter((plan) => activeStatuses.has(plan.status)).length,
    touched: touchedPlans.map((plan) => ({
      id: plan.id,
      symbol: instrumentOf(plan.instrumentId)?.symbol ?? plan.instrumentId,
      status: plan.status,
      updatedAt: plan.updatedAt,
    })),
  };

  const journalEntries = state.journalEntries.filter((entry) => entry.executedAt >= isoStart && entry.executedAt <= isoEnd);
  const journal = {
    count: journalEntries.length,
    followedPlan: journalEntries.filter((entry) => entry.followedPlan).length,
    processCorrect: journalEntries.filter((entry) => entry.processQuality === "correct").length,
    resultProfit: journalEntries.filter((entry) => entry.resultQuality === "profit").length,
    resultLoss: journalEntries.filter((entry) => entry.resultQuality === "loss").length,
    lessons: [...new Set(journalEntries.flatMap((entry) => entry.lessons))].slice(0, 12),
  };

  const warnings: string[] = [];
  if (endMetrics.totalPositionPct > state.settings.maxTotalPositionPct) {
    warnings.push(`总仓位 ${pct(endMetrics.totalPositionPct)} 超过设定上限 ${state.settings.maxTotalPositionPct}%`);
  }
  if (endMetrics.largestHoldingPct > state.settings.maxSinglePositionPct) {
    warnings.push(`最大单仓 ${pct(endMetrics.largestHoldingPct)} 超过设定上限 ${state.settings.maxSinglePositionPct}%`);
  }
  if (endMetrics.technologyExposurePct > state.settings.maxTechnologyExposurePct) {
    warnings.push(`科技暴露 ${pct(endMetrics.technologyExposurePct)} 超过设定上限 ${state.settings.maxTechnologyExposurePct}%`);
  }
  if (endMetrics.dataConfidence < 100) warnings.push("部分持仓缺少有效行情，价格相关结论需降级。");

  const market = options.marketSummary ?? { summary: "未获取市场环境数据", notes: [], source: "" };

  const summaryParts: string[] = [];
  summaryParts.push(changePct !== null
    ? `组合市值 ${money(startValue)} → ${money(endValue)}（${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%）`
    : `组合期末市值 ${money(endValue)}`);
  const addedCount = holdings.filter((holding) => holding.status === "added").length;
  const removedCount = holdings.filter((holding) => holding.status === "removed").length;
  if (addedCount || removedCount) summaryParts.push(`新增 ${addedCount} 项、移除 ${removedCount} 项`);
  if (plans.completed || plans.invalidated) summaryParts.push(`计划完成 ${plans.completed} 项、失效 ${plans.invalidated} 项`);
  if (journal.count) summaryParts.push(`日志 ${journal.count} 条、遵守计划 ${journal.followedPlan}/${journal.count}`);
  const summary = summaryParts.length ? `${summaryParts.join("；")}。` : "期内无持仓、计划或日志变化。";

  const rangeLabel = `${periodStart.toISOString().slice(0, 10)} 至 ${isoEnd.slice(0, 10)}`;
  return {
    id: options.id ?? crypto.randomUUID(),
    type,
    periodStart: isoStart,
    periodEnd: isoEnd,
    createdAt: isoEnd,
    title: `${rangeLabel} ${type === "weekly" ? "周" : "月"}复盘`,
    summary,
    portfolio: { startValue, endValue, changePct, note: portfolioNote },
    holdings,
    plans,
    journal,
    risk: {
      startPositionPct: startMetrics?.totalPositionPct ?? null,
      endPositionPct: endMetrics.totalPositionPct,
      startLargestPct: startMetrics?.largestHoldingPct ?? null,
      endLargestPct: endMetrics.largestHoldingPct,
      warnings,
    },
    market,
    dataQuality,
  };
}
