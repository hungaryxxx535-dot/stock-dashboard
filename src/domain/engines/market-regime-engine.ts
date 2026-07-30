import { calculateWeightedScore, type ScoreInput } from "./scoring";

export type MarketRegimeResult = ReturnType<typeof calculateWeightedScore> & {
  label: "数据不足" | "风险偏好收缩" | "震荡中性" | "风险偏好改善";
  action: "等待数据" | "仅供结构判断" | "持有观察" | "等待条件";
  reasons: string[];
  invalidation: string[];
};

export function marketRegimeEngine(inputs: ScoreInput[]): MarketRegimeResult {
  const result = calculateWeightedScore(inputs, 30);
  if (result.score === null || result.confidence < 45) {
    return {
      ...result,
      label: "数据不足",
      action: result.completeness > 25 ? "仅供结构判断" : "等待数据",
      reasons: ["有效市场证据不足，不生成方向性买卖指令。"],
      invalidation: ["补齐指数、波动率、利率和市场宽度后重新评估。"],
    };
  }
  const label = result.score >= 62 ? "风险偏好改善" : result.score <= 42 ? "风险偏好收缩" : "震荡中性";
  return {
    ...result,
    label,
    action: label === "风险偏好收缩" ? "持有观察" : "等待条件",
    reasons: result.contributions.filter((item) => item.state !== "missing").sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4).map((item) => `${item.label}贡献${item.contribution >= 0 ? "正" : "负"}向证据`),
    invalidation: ["任一核心数据源转为过期或缺失", "市场宽度和波动率出现反向变化"],
  };
}
