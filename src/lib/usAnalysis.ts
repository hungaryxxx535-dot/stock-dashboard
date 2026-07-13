import type { UsDailyCloseData } from "@/data/usDailyClose";
import type { UsHolding } from "@/data/portfolio";
import type { MacroIndicator, NewsItem } from "@/lib/market-intelligence/types";
import type { UsMarketIntelligence } from "@/lib/usMarketIntelligence";

export type UsRegimeLabel = "进攻环境" | "震荡环境" | "防守环境" | "数据不足";

export type UsHoldingAnalysis = {
  code: string;
  name: string;
  value: number;
  pnl: number;
  pnlPct: number | null;
  weight: number;
  close: number;
  changePct: number | null;
  distanceToStopPct: number | null;
  distanceToTargetPct: number | null;
  factor: string;
  macroSensitivity: string;
  action: string;
  risk: "低" | "中" | "高";
  news: NewsItem[];
};

export type UsAnalysisResult = {
  score: number | null;
  regime: UsRegimeLabel;
  confidence: number;
  headline: string;
  actionBias: string;
  reasons: string[];
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number | null;
  weightedDayChange: number | null;
  risingCount: number;
  fallingCount: number;
  flatCount: number;
  topHolding: string;
  topWeight: number;
  aiInfrastructurePct: number;
  chinaAdrPct: number;
  leveragedPct: number;
  holdings: UsHoldingAnalysis[];
  macroCards: MacroIndicator[];
  importantNews: NewsItem[];
  reviewPoints: string[];
};

const pct = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function macroValue(macro: MacroIndicator[], id: string): number | null {
  return macro.find((item) => item.id === id)?.value ?? null;
}

function factorFor(code: string): string {
  if (["AMD", "INTC", "RMBS"].includes(code)) return "半导体周期与AI芯片";
  if (["ANET", "APH"].includes(code)) return "数据中心资本开支";
  if (code === "META") return "广告周期、AI资本开支与长久期估值";
  if (["PDD", "TME"].includes(code)) return "中国消费、监管与中概风险偏好";
  if (code === "MSFU") return "微软走势与2倍杠杆衰减";
  return "个股基本面与市场风险偏好";
}

function sensitivityFor(code: string): string {
  if (["AMD", "ANET", "RMBS", "META", "APH"].includes(code)) return "对美债收益率、AI资本开支和科技股风险偏好高度敏感。";
  if (code === "INTC") return "除利率外，还高度依赖制造转型、补贴、资本开支和竞争格局。";
  if (["PDD", "TME"].includes(code)) return "同时受中国宏观、人民币预期、美国监管与中概估值影响。";
  if (code === "MSFU") return "对微软单日波动放大约2倍，并存在长期波动损耗，不适合补跌。";
  return "需要结合利率、盈利预期与行业事件判断。";
}

function newsForHolding(news: NewsItem[], code: string): NewsItem[] {
  return news.filter((item) => item.relevance.some((tag) => tag === code || tag.includes(code) || (code === "MSFU" && tag.includes("MSFT")))).slice(0, 5);
}

function riskFor(holding: UsHolding, weight: number, distanceToStopPct: number | null): UsHoldingAnalysis["risk"] {
  if (holding.type === "杠杆仓" || weight >= 35 || (distanceToStopPct !== null && distanceToStopPct <= 3)) return "高";
  if (weight >= 10 || holding.type === "趋势仓" || holding.type === "中概仓") return "中";
  return "低";
}

function actionFor(
  holding: UsHolding,
  regime: UsRegimeLabel,
  changePct: number | null,
  distanceToStopPct: number | null,
  distanceToTargetPct: number | null,
  weight: number,
): string {
  if (holding.type === "杠杆仓") {
    if (regime === "防守环境" || (changePct ?? 0) < 0) return "杠杆仓不补跌；若继续走弱，优先减仓或退出。";
    return "仅保留小仓趋势跟随，不扩大仓位，严格执行止损。";
  }
  if (distanceToStopPct !== null && distanceToStopPct <= 0) return "已跌破纪律线，下一交易日优先执行风控，不以摊低成本替代复盘。";
  if (distanceToStopPct !== null && distanceToStopPct <= 5) return "距离止损线较近，暂停加仓，等待价格重新站稳。";
  if (distanceToTargetPct !== null && distanceToTargetPct <= 0) return "达到或超过目标区间，优先分批锁盈并上移保护线。";
  if (weight >= 35) return regime === "进攻环境" ? "核心仓继续持有，但单票权重已高，不再主动加仓。" : "核心仓权重较高，市场转弱时优先降低回撤暴露。";
  if (regime === "防守环境") return "不新增高贝塔仓位；反弹优先检查仓位与止损纪律。";
  if (regime === "进攻环境" && (changePct ?? 0) > 0) return "趋势允许继续持有，但等待回踩确认，不追单日急涨。";
  if (regime === "震荡环境") return "保持原仓观察，只在业绩、指引或技术确认后调整。";
  return "等待更多市场和基本面证据，不依据单一新闻交易。";
}

export function analyzeUsPortfolio(
  holdings: UsHolding[],
  closeData: UsDailyCloseData,
  intelligence: UsMarketIntelligence,
): UsAnalysisResult {
  const quoteMap = new Map(closeData.quotes.map((quote) => [quote.symbol, quote]));
  const preliminary = holdings.map((holding) => {
    const quote = quoteMap.get(holding.code);
    const close = quote?.close ?? holding.currentPrice;
    const value = close * holding.quantity;
    const cost = holding.costPrice * holding.quantity;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : null;
    return { holding, quote, close, value, cost, pnl, pnlPct };
  });
  const totalValue = preliminary.reduce((sum, item) => sum + item.value, 0);
  const totalCost = preliminary.reduce((sum, item) => sum + item.cost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;

  let score = 50;
  let evidence = 0;
  const reasons: string[] = [];
  const macro = intelligence.macro;

  const sp500 = macroValue(macro, "sp500_change");
  if (sp500 !== null) {
    score += clamp(sp500 * 5, -10, 10);
    evidence += 1;
    reasons.push(`标普500最近交易日涨跌${sp500 >= 0 ? "+" : ""}${sp500.toFixed(2)}%。`);
  }
  const nasdaq = macroValue(macro, "nasdaq_change");
  if (nasdaq !== null) {
    score += clamp(nasdaq * 5, -12, 12);
    evidence += 1;
    reasons.push(`纳斯达克综合指数最近交易日涨跌${nasdaq >= 0 ? "+" : ""}${nasdaq.toFixed(2)}%。`);
  }
  const vix = macroValue(macro, "vixcls");
  if (vix !== null) {
    score += vix < 18 ? 8 : vix < 25 ? 1 : vix < 30 ? -6 : -12;
    evidence += 1;
    reasons.push(`VIX为${vix.toFixed(1)}，${vix < 18 ? "波动率较低" : vix >= 30 ? "避险情绪明显" : "波动率偏高"}。`);
  }
  const tenYear = macroValue(macro, "dgs10");
  if (tenYear !== null) {
    score += tenYear >= 4.7 ? -10 : tenYear >= 4.3 ? -6 : tenYear <= 3.7 ? 5 : 0;
    evidence += 1;
    reasons.push(`美国10年期国债收益率为${tenYear.toFixed(2)}%，${tenYear >= 4.3 ? "对科技估值形成压力" : "对成长估值压力相对可控"}。`);
  }
  const cpiMom = macroValue(macro, "us_cpi_mom");
  if (cpiMom !== null) {
    score += cpiMom >= 0.4 ? -7 : cpiMom <= 0.2 ? 4 : 0;
    evidence += 1;
    reasons.push(`美国CPI月环比约${cpiMom.toFixed(2)}%，${cpiMom >= 0.4 ? "通胀偏热" : cpiMom <= 0.2 ? "通胀相对温和" : "通胀处于中间区间"}。`);
  }
  const unrate = macroValue(macro, "us_unrate");
  if (unrate !== null) {
    score += unrate >= 5 ? -8 : unrate >= 4.3 ? -2 : 3;
    evidence += 1;
    reasons.push(`美国失业率为${unrate.toFixed(1)}%，${unrate >= 4.3 ? "就业边际降温" : "就业仍具韧性"}。`);
  }

  const validDayMoves = preliminary.filter((item) => item.quote?.changePct !== null && item.quote?.changePct !== undefined);
  const weightedDayChange = validDayMoves.length && totalValue > 0
    ? validDayMoves.reduce((sum, item) => sum + (item.quote?.changePct ?? 0) * item.value, 0) / totalValue
    : null;
  if (weightedDayChange !== null) {
    score += clamp(weightedDayChange * 2.5, -8, 8);
    evidence += 1;
    reasons.push(`你的美股持仓按市值加权当日涨跌约${weightedDayChange >= 0 ? "+" : ""}${weightedDayChange.toFixed(2)}%。`);
  }

  const relevantNews = intelligence.news.filter((item) => item.category === "美股市场" || item.category === "美股持仓" || item.category === "海外宏观");
  const positiveNews = relevantNews.filter((item) => item.impact === "利多").length;
  const negativeNews = relevantNews.filter((item) => item.impact === "利空").length;
  if (relevantNews.length) {
    score += clamp((positiveNews - negativeNews) * 0.8, -6, 6);
    evidence += 1;
    reasons.push(`过去24小时新闻规则初筛：利多${positiveNews}条、利空${negativeNews}条，其余需阅读原文判断。`);
  }

  score = Math.round(clamp(score));
  const regime: UsRegimeLabel = evidence < 3 ? "数据不足" : score >= 63 ? "进攻环境" : score <= 42 ? "防守环境" : "震荡环境";
  const actionBias = regime === "进攻环境"
    ? "市场与宏观允许保留科技进攻仓，但仍以回踩确认和业绩兑现为前提，不追新闻脉冲。"
    : regime === "防守环境"
      ? "利率、波动率或市场趋势偏不利，优先控制高贝塔和杠杆仓回撤，暂缓新增风险敞口。"
      : regime === "震荡环境"
        ? "指数与宏观信号不一致，维持中性仓位，重点看财报、指引和关键技术位。"
        : "外部证据不足，暂不生成方向性仓位结论。";

  const holdingAnalyses: UsHoldingAnalysis[] = preliminary.map((item) => {
    const weight = pct(item.value, totalValue);
    const distanceToStopPct = item.close > 0 && item.holding.stopLoss > 0 ? ((item.close - item.holding.stopLoss) / item.close) * 100 : null;
    const distanceToTargetPct = item.close > 0 && item.holding.targetPrice > 0 ? ((item.holding.targetPrice - item.close) / item.close) * 100 : null;
    return {
      code: item.holding.code,
      name: item.holding.name,
      value: item.value,
      pnl: item.pnl,
      pnlPct: item.pnlPct,
      weight,
      close: item.close,
      changePct: item.quote?.changePct ?? null,
      distanceToStopPct,
      distanceToTargetPct,
      factor: factorFor(item.holding.code),
      macroSensitivity: sensitivityFor(item.holding.code),
      action: actionFor(item.holding, regime, item.quote?.changePct ?? null, distanceToStopPct, distanceToTargetPct, weight),
      risk: riskFor(item.holding, weight, distanceToStopPct),
      news: newsForHolding(relevantNews, item.holding.code),
    };
  }).sort((a, b) => b.value - a.value);

  const risingCount = preliminary.filter((item) => (item.quote?.changePct ?? 0) > 0).length;
  const fallingCount = preliminary.filter((item) => (item.quote?.changePct ?? 0) < 0).length;
  const flatCount = preliminary.length - risingCount - fallingCount;
  const top = holdingAnalyses[0];
  const aiInfrastructureValue = holdingAnalyses.filter((item) => ["AMD", "INTC", "RMBS", "META", "ANET", "APH", "MSFU"].includes(item.code)).reduce((sum, item) => sum + item.value, 0);
  const chinaAdrValue = holdingAnalyses.filter((item) => ["PDD", "TME"].includes(item.code)).reduce((sum, item) => sum + item.value, 0);
  const leveragedValue = holdingAnalyses.filter((item) => item.code === "MSFU").reduce((sum, item) => sum + item.value, 0);

  const reviewPoints = [
    `当前美股判断为“${regime}”，市场环境分${evidence < 3 ? "不足" : score}，核心依据是指数趋势、VIX、美债收益率、通胀、就业与持仓当日表现。`,
    `AI与数据中心相关仓位约占美股持仓${pct(aiInfrastructureValue, totalValue).toFixed(1)}%，因此美债收益率和大型科技资本开支是账户最重要的外部变量。`,
    `中概仓约占${pct(chinaAdrValue, totalValue).toFixed(1)}%，需要同时跟踪中国消费、监管、汇率与美国对中概股的政策风险。`,
    top ? `${top.name}为当前第一大仓，占美股市值约${top.weight.toFixed(1)}%；其动作应由市场环境、公司业绩和纪律线共同决定。` : "暂无有效持仓数据。",
  ];

  return {
    score: evidence < 3 ? null : score,
    regime,
    confidence: Math.min(100, 25 + evidence * 10),
    headline: regime === "进攻环境" ? "外部环境偏支持科技与成长，但不等于可以无条件追涨。" : regime === "防守环境" ? "当前更应保护本金和已有利润，高贝塔及杠杆仓优先风控。" : regime === "震荡环境" ? "宏观与市场信号分化，个股业绩和纪律线比方向押注更重要。" : "数据尚不足，暂不输出强方向判断。",
    actionBias,
    reasons,
    totalValue,
    totalCost,
    totalPnl,
    totalPnlPct,
    weightedDayChange,
    risingCount,
    fallingCount,
    flatCount,
    topHolding: top?.name ?? "—",
    topWeight: top?.weight ?? 0,
    aiInfrastructurePct: pct(aiInfrastructureValue, totalValue),
    chinaAdrPct: pct(chinaAdrValue, totalValue),
    leveragedPct: pct(leveragedValue, totalValue),
    holdings: holdingAnalyses,
    macroCards: macro.filter((item) => ["sp500_change", "nasdaq_change", "vixcls", "dgs10", "dff", "us_cpi_mom", "us_unrate", "us_payroll_change"].includes(item.id)),
    importantNews: relevantNews.slice(0, 12),
    reviewPoints,
  };
}
