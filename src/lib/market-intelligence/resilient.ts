import { loadEastmoneyIndicesFallback, loadGoogleNewsFallback } from "./public-fallbacks";
import type { MarketIntelligencePayload, MarketRegime, NewsItem } from "./types";

function recomputeRegime(payload: MarketIntelligencePayload): MarketRegime {
  let score = 50;
  let evidence = 0;
  const reasons: string[] = [];

  if (payload.indices.length) {
    const average = payload.indices.reduce((sum, item) => sum + item.pctChange, 0) / payload.indices.length;
    score += Math.max(-15, Math.min(15, average * 5));
    evidence += 2;
    reasons.push(`主要A股指数平均涨跌${average >= 0 ? "+" : ""}${average.toFixed(2)}%`);
  }

  const portfolioAverage = payload.macro.find((item) => item.id === "portfolio_avg_change")?.value;
  if (portfolioAverage !== undefined && portfolioAverage !== null) {
    score += Math.max(-8, Math.min(8, portfolioAverage * 2.5));
    evidence += 1;
    reasons.push(`当前持仓平均涨跌${portfolioAverage >= 0 ? "+" : ""}${portfolioAverage.toFixed(2)}%`);
  }

  const north = payload.macro.find((item) => item.id === "north_money")?.value;
  if (north !== undefined && north !== null) {
    score += north > 0 ? 7 : -7;
    evidence += 1;
    reasons.push(`北向资金${north > 0 ? "净流入" : "净流出"}${Math.abs(north).toFixed(0)}百万元`);
  }

  const pmi = payload.macro.find((item) => item.id === "cn_pmi")?.value;
  if (pmi !== undefined && pmi !== null) {
    score += pmi >= 50 ? 6 : -6;
    evidence += 1;
    reasons.push(`制造业PMI为${pmi.toFixed(1)}，处于${pmi >= 50 ? "扩张" : "收缩"}区间`);
  }

  const vix = payload.macro.find((item) => item.id === "vixcls")?.value;
  if (vix !== undefined && vix !== null) {
    score += vix < 20 ? 6 : vix >= 30 ? -10 : -3;
    evidence += 1;
    reasons.push(`VIX为${vix.toFixed(1)}，海外波动${vix < 20 ? "较低" : vix >= 30 ? "显著升高" : "偏高"}`);
  }

  const tenYear = payload.macro.find((item) => item.id === "dgs10")?.value;
  if (tenYear !== undefined && tenYear !== null) {
    score += tenYear >= 4.5 ? -6 : 2;
    evidence += 1;
    reasons.push(`美国10年期国债收益率${tenYear.toFixed(2)}%`);
  }

  if (payload.news.length) {
    const positive = payload.news.filter((item) => item.impact === "利多").length;
    const negative = payload.news.filter((item) => item.impact === "利空").length;
    score += Math.max(-6, Math.min(6, (positive - negative) * 0.6));
    evidence += 1;
    reasons.push(`过去24小时新闻初筛利多${positive}条、利空${negative}条，其余需人工判断`);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  if (evidence < 2) {
    const failedSources = payload.sourceStatus
      .filter((item) => item.status === "error" || item.status === "not_configured")
      .map((item) => `${item.name}：${item.message}`)
      .slice(0, 3);
    return {
      label: "数据不足",
      score: null,
      confidence: Math.round((evidence / 7) * 100),
      reasons: reasons.length ? reasons : failedSources.length ? failedSources : ["外部数据源尚未形成有效证据链"],
      actionBias: "当前仅输出持仓结构分析；请在系统状态中查看具体缺失接口。",
    };
  }

  const label: MarketRegime["label"] = score >= 62 ? "风险偏好改善" : score <= 42 ? "风险偏好收缩" : "震荡中性";
  return {
    label,
    score,
    confidence: Math.min(100, 35 + evidence * 9),
    reasons,
    actionBias:
      label === "风险偏好改善"
        ? "可以寻找确认后的进攻机会，但不得忽视估值、仓位和事件风险。"
        : label === "风险偏好收缩"
          ? "优先控制回撤、减少追涨，等待宏观和市场信号企稳。"
          : "保持中性仓位，优先做高胜率的结构优化。",
  };
}

function mergeNews(primary: NewsItem[], fallback: NewsItem[]): NewsItem[] {
  const map = new Map<string, NewsItem>();
  [...primary, ...fallback].forEach((item) => {
    const key = item.url || item.title;
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 50);
}

export async function applyResilientFallbacks(payload: MarketIntelligencePayload): Promise<MarketIntelligencePayload> {
  const needIndices = payload.indices.length < 3;
  const needNews = payload.news.length < 8;
  const [indexFallback, newsFallback] = await Promise.all([
    needIndices ? loadEastmoneyIndicesFallback() : Promise.resolve(null),
    needNews ? loadGoogleNewsFallback() : Promise.resolve(null),
  ]);

  const indexMap = new Map(payload.indices.map((item) => [item.code, item]));
  indexFallback?.indices.forEach((item) => {
    if (!indexMap.has(item.code)) indexMap.set(item.code, item);
  });
  const indices = [...indexMap.values()];
  const news = mergeNews(payload.news, newsFallback?.news ?? []);
  const sourceStatus = [
    ...payload.sourceStatus,
    ...(indexFallback ? [indexFallback.status] : []),
    ...(newsFallback ? [newsFallback.status] : []),
  ];
  const warnings = [
    ...payload.warnings,
    ...(indexFallback?.warnings ?? []),
    ...(newsFallback?.warnings ?? []),
  ];

  const extended = {
    ...payload,
    indices,
    news,
    sourceStatus,
    warnings,
    generatedAt: new Date().toISOString(),
  };
  return { ...extended, regime: recomputeRegime(extended) };
}
