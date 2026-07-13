export type UsRegimeLabel = "风险偏好改善" | "震荡中性" | "风险偏好收缩" | "数据不足";

export type UsBenchmark = {
  id: string;
  name: string;
  value: number | null;
  date: string;
  change1d: number | null;
  change20d: number | null;
  source: string;
};

export type UsMacroIndicator = {
  id: string;
  name: string;
  value: number | null;
  previous: number | null;
  unit: string;
  date: string;
  interpretation: string;
  source: string;
};

export type UsNewsItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string;
  category: "美联储与利率" | "美股市场" | "AI与半导体" | "中概股" | "持仓相关";
  impact: "利多" | "利空" | "中性" | "待判断";
  relatedSymbols: string[];
  source: string;
};

export type UsHoldingDecision = {
  symbol: string;
  name: string;
  close: number | null;
  changePct: number | null;
  quantity: number;
  marketValue: number;
  portfolioWeight: number;
  stopLoss: number;
  targetPrice: number;
  distanceToStopPct: number | null;
  distanceToTargetPct: number | null;
  sector: string;
  sensitivity: string[];
  newsCount: number;
  positiveNews: number;
  negativeNews: number;
  signal: "持有观察" | "进攻候选" | "减仓复核" | "严格风控" | "数据不足";
  rationale: string[];
};

export type UsMarketRegime = {
  label: UsRegimeLabel;
  score: number | null;
  confidence: number;
  reasons: string[];
  actionBias: string;
};

export type UsMarketIntelligence = {
  generatedAt: string;
  tradingDate: string;
  quoteStatus: string;
  quoteSource: string;
  regime: UsMarketRegime;
  benchmarks: UsBenchmark[];
  macro: UsMacroIndicator[];
  news: UsNewsItem[];
  holdings: UsHoldingDecision[];
  portfolio: {
    totalValue: number;
    weightedChangePct: number | null;
    top1Weight: number;
    top3Weight: number;
    positiveCount: number;
    negativeCount: number;
    aiInfrastructureWeight: number;
    chinaAdrWeight: number;
    leveragedWeight: number;
  };
  conclusions: string[];
  warnings: string[];
};
