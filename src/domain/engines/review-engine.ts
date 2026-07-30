import type { JournalEntry } from "@/domain/model";

export function reviewEngine(entries: JournalEntry[]) {
  const closed = entries.filter((entry) => Number.isFinite(entry.pnl));
  const winners = closed.filter((entry) => entry.pnl > 0);
  const losers = closed.filter((entry) => entry.pnl < 0);
  const sum = (items: JournalEntry[]) => items.reduce((total, item) => total + item.pnl, 0);
  const average = (items: JournalEntry[]) => items.length ? sum(items) / items.length : 0;
  const ruleBreaches = closed.filter((entry) => !entry.followedPlan);
  const mistakeCounts = closed.flatMap((entry) => entry.mistakes).reduce<Record<string, number>>((result, mistake) => {
    result[mistake] = (result[mistake] ?? 0) + 1;
    return result;
  }, {});
  return {
    trades: closed.length,
    winRate: closed.length ? (winners.length / closed.length) * 100 : 0,
    profitLossRatio: Math.abs(average(losers)) > 0 ? average(winners) / Math.abs(average(losers)) : null,
    averageProfit: average(winners),
    averageLoss: average(losers),
    maxSingleLoss: losers.length ? Math.min(...losers.map((entry) => entry.pnl)) : 0,
    unplannedTrades: ruleBreaches.length,
    disciplineScore: closed.length ? ((closed.length - ruleBreaches.length) / closed.length) * 100 : 100,
    mistakeRanking: Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1]),
    processCorrect: closed.filter((entry) => entry.processQuality === "correct").length,
    resultProfitable: winners.length,
  };
}
