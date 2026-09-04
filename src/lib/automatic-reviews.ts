import type { AppState, Review } from "@/domain/model";
import { buildPeriodReview } from "@/domain/engines/review-engine";

type MarketSummary = { summary: string; notes: string[]; source: string };
type ReviewType = Review["type"];

function shanghaiParts(now: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return values as { year: number; month: number; day: number; hour: number; minute: number };
}

function previousBusinessDay(day: Date) {
  const result = new Date(day);
  do result.setUTCDate(result.getUTCDate() - 1); while ([0, 6].includes(result.getUTCDay()));
  return result;
}

export function automaticReviewSchedule(now = new Date()): { date: string; periodEnd: Date; types: ReviewType[] } {
  const local = shanghaiParts(now);
  let day = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const afterClose = local.hour > 15 || (local.hour === 15 && local.minute >= 10);
  if ([0, 6].includes(day.getUTCDay())) while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() - 1);
  else if (!afterClose) day = previousBusinessDay(day);
  const date = day.toISOString().slice(0, 10);
  const types: ReviewType[] = ["daily"];
  if (day.getUTCDay() === 5) types.push("weekly");
  const nextBusiness = new Date(day);
  do nextBusiness.setUTCDate(nextBusiness.getUTCDate() + 1); while ([0, 6].includes(nextBusiness.getUTCDay()));
  if (nextBusiness.getUTCMonth() !== day.getUTCMonth()) types.push("monthly");
  return { date, periodEnd: new Date(`${date}T15:10:00+08:00`), types };
}

export function generateDueAutomaticReviews(state: AppState, now = new Date(), marketSummary?: MarketSummary): { state: AppState; generated: ReviewType[] } {
  if (state.mode === "demo") return { state, generated: [] };
  const schedule = automaticReviewSchedule(now);
  const generated: ReviewType[] = [];
  const reviews = [...state.reviews];
  for (const type of schedule.types) {
    const reviewId = `auto-${type}-${schedule.date}`;
    if (reviews.some((review) => review.id === reviewId)) continue;
    reviews.push(buildPeriodReview({ ...state, reviews }, type, { now: schedule.periodEnd, id: reviewId, marketSummary }));
    generated.push(type);
  }
  if (!generated.length) return { state, generated };
  const snapshotId = `auto-snapshot-${schedule.date}`;
  const snapshots = state.snapshots.some((snapshot) => snapshot.id === snapshotId) ? state.snapshots : [...state.snapshots, {
    id: snapshotId,
    versionId: state.dataVersions.at(-1)?.id ?? "unknown",
    createdAt: schedule.periodEnd.toISOString(),
    reason: "自动复盘基线",
    holdings: structuredClone(state.holdings),
    cashBalances: structuredClone(state.cashBalances),
    transactions: structuredClone(state.transactions),
  }];
  return { state: { ...state, reviews, snapshots, updatedAt: now.toISOString() }, generated };
}
