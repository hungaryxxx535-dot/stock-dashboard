import { calculateWeightedScore, type ScoreInput } from "./scoring";

export function candidateScoringEngine(inputs: ScoreInput[]) {
  const result = calculateWeightedScore(inputs, 12);
  return {
    ...result,
    status: result.score === null || result.confidence < 50 ? "数据不足" : result.score >= 70 ? "加仓复核" : result.score >= 55 ? "仅观察" : "等待条件",
    explanation: result.score === null
      ? "缺失数据不会按满分或中性分处理。"
      : `最终分数已按${result.completeness}%完整度和${result.freshness}%新鲜度调整。`,
  };
}
