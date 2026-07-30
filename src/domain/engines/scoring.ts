export type ScoreInput = {
  id: string;
  label: string;
  value: number | null;
  normalizedScore: number | null;
  weight: number;
  dataTime: string | null;
  freshnessHours: number | null;
  positiveWhen: string;
  negativeWhen: string;
};

export type ScoreContribution = ScoreInput & {
  effectiveWeight: number;
  contribution: number;
  state: "positive" | "negative" | "neutral" | "missing" | "stale";
};

export type WeightedScore = {
  score: number | null;
  completeness: number;
  freshness: number;
  confidence: number;
  contributions: ScoreContribution[];
  missing: string[];
};

export function calculateWeightedScore(inputs: ScoreInput[], staleAfterHours = 24): WeightedScore {
  const totalWeight = inputs.reduce((sum, input) => sum + Math.max(0, input.weight), 0);
  let availableWeight = 0;
  let freshnessWeight = 0;
  let weightedScore = 0;

  const contributions = inputs.map<ScoreContribution>((input) => {
    if (input.value === null || input.normalizedScore === null) {
      return { ...input, effectiveWeight: 0, contribution: 0, state: "missing" };
    }
    const stale = input.freshnessHours !== null && input.freshnessHours > staleAfterHours;
    const freshnessFactor = stale ? 0.4 : 1;
    const effectiveWeight = input.weight * freshnessFactor;
    const contribution = input.normalizedScore * effectiveWeight;
    availableWeight += input.weight;
    freshnessWeight += effectiveWeight;
    weightedScore += contribution;
    return {
      ...input,
      effectiveWeight,
      contribution,
      state: stale ? "stale" : input.normalizedScore >= 60 ? "positive" : input.normalizedScore <= 40 ? "negative" : "neutral",
    };
  });

  const completeness = totalWeight > 0 ? (availableWeight / totalWeight) * 100 : 0;
  const freshness = availableWeight > 0 ? (freshnessWeight / availableWeight) * 100 : 0;
  const confidence = Math.round(Math.min(100, completeness * 0.65 + freshness * 0.35));
  const score = freshnessWeight > 0 ? Math.round(weightedScore / freshnessWeight) : null;
  return {
    score,
    completeness: Math.round(completeness),
    freshness: Math.round(freshness),
    confidence,
    contributions,
    missing: contributions.filter((item) => item.state === "missing").map((item) => item.label),
  };
}
