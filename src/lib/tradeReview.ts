export const TRADE_REVIEW_STORAGE_KEY = "feige:trade-reviews:v1";

export type TradeReviewEntry = {
  id: string;
  date: string;
  symbol: string;
  action: string;
  thesis: string;
  execution: string;
  result: string;
  lesson: string;
  disciplineScore: number;
  createdAt: string;
};

export function loadTradeReviews(): TradeReviewEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRADE_REVIEW_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TradeReviewEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTradeReviews(entries: TradeReviewEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRADE_REVIEW_STORAGE_KEY, JSON.stringify(entries));
}

export function createTradeReview(input: Omit<TradeReviewEntry, "id" | "createdAt">): TradeReviewEntry {
  return {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
}
