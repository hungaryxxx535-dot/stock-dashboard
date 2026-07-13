export type SourceStatus = {
  id: string;
  name: string;
  status: "online" | "partial" | "not_configured" | "error";
  updatedAt: string;
  message: string;
};

export type MarketIndexSnapshot = {
  code: string;
  name: string;
  tradeDate: string;
  close: number;
  pctChange: number;
  source: string;
};

export type MacroIndicator = {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  period: string;
  previous: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  interpretation: string;
  source: string;
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string;
  category: "中国宏观" | "A股市场" | "半导体算力" | "海外宏观" | "持仓相关" | "美股市场" | "美股持仓";
  impact: "利多" | "中性" | "利空" | "待判断";
  relevance: string[];
  source: string;
};

export type MarketRegime = {
  label: "风险偏好改善" | "震荡中性" | "风险偏好收缩" | "数据不足";
  score: number | null;
  confidence: number;
  reasons: string[];
  actionBias: string;
};

export type MarketIntelligencePayload = {
  generatedAt: string;
  regime: MarketRegime;
  indices: MarketIndexSnapshot[];
  macro: MacroIndicator[];
  news: NewsItem[];
  sourceStatus: SourceStatus[];
  warnings: string[];
};
