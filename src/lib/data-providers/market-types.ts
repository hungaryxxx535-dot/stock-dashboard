import type { DataSourceStatus } from "@/domain/model";
import type { NewsItem } from "@/lib/market-intelligence/types";

export type MarketCard = {
  id: string;
  name: string;
  value: number | null;
  changePct: number | null;
  unit: string;
  source: string;
  marketTime: string | null;
  fetchedAt: string;
  delayed: boolean;
  cached: boolean;
  fallback: boolean;
  status: "available" | "missing" | "stale";
};

export type UnifiedMarketSnapshot = {
  generatedAt: string;
  cards: MarketCard[];
  news: NewsItem[];
  statuses: DataSourceStatus[];
  warnings: string[];
  confidence: number;
};
