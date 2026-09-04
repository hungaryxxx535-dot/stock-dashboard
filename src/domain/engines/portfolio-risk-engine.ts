import type { AppState, Holding, Instrument, Quote } from "@/domain/model";

export type HoldingValuation = { holding: Holding; instrument: Instrument; quote: Quote | null; valueBase: number; costBase: number; pnlBase: number; estimated: boolean };
export type PortfolioMetrics = { totalAssets: number; investedValue: number; cashValue: number; totalPositionPct: number; brokerPositionPct: number; aSharePositionPct: number; usPositionPct: number; largestHoldingPct: number; topThreePct: number; technologyExposurePct: number; defensiveExposurePct: number; currencyExposure: Record<string, number>; valuations: HoldingValuation[]; dataConfidence: number };
export type StressScenario = { id: string; name: string; impactAmount: number; impactPct: number; severity: "low" | "medium" | "high"; assumptions: string[] };
export type RiskAction = { id: string; priority: "high" | "medium" | "info"; title: string; reason: string; action: string; amount: number | null; instrumentId: string | null };

const fx = (state: AppState, currency: string) => state.settings.exchangeRates[currency as "CNY" | "USD" | "HKD"] ?? 1;
export function calculatePortfolioMetrics(state: AppState): PortfolioMetrics {
  const valuations = state.holdings.flatMap((holding) => {
    const instrument = state.instruments.find((item) => item.id === holding.instrumentId);
    if (!instrument || holding.status !== "open" || holding.quantity === 0) return [];
    const quote = state.quotes.find((item) => item.instrumentId === instrument.id) ?? null;
    const price = quote?.price ?? holding.economicCost;
    const valueBase = holding.quantity * price * fx(state, instrument.currency);
    const costBase = holding.quantity * holding.economicCost * fx(state, instrument.currency);
    return [{ holding, instrument, quote, valueBase, costBase, pnlBase: valueBase - costBase, estimated: !quote?.price }];
  });
  const investedValue = valuations.reduce((sum, item) => sum + item.valueBase, 0);
  const cashValue = state.cashBalances.reduce((sum, item) => sum + item.amount * fx(state, item.currency), 0);
  const totalAssets = investedValue + cashValue;
  const share = (value: number) => totalAssets > 0 ? value / totalAssets * 100 : 0;
  const exposure = (test: (item: HoldingValuation) => boolean) => valuations.filter(test).reduce((sum, item) => sum + item.valueBase, 0);
  const sorted = [...valuations].sort((a, b) => b.valueBase - a.valueBase);
  const primary = state.accounts.find((account) => account.isPrimary);
  const primaryInvested = valuations.filter((item) => item.holding.accountId === primary?.id).reduce((sum, item) => sum + item.valueBase, 0);
  const primaryCash = state.cashBalances.filter((cash) => cash.accountId === primary?.id).reduce((sum, item) => sum + item.amount * fx(state, item.currency), 0);
  const currencyValues: Record<string, number> = {};
  valuations.forEach((item) => { currencyValues[item.instrument.currency] = (currencyValues[item.instrument.currency] ?? 0) + item.valueBase; });
  return {
    totalAssets, investedValue, cashValue, totalPositionPct: share(investedValue),
    brokerPositionPct: primaryInvested + primaryCash > 0 ? primaryInvested / (primaryInvested + primaryCash) * 100 : 0,
    aSharePositionPct: share(exposure((item) => item.instrument.market === "CN")),
    usPositionPct: share(exposure((item) => item.instrument.market === "US")),
    largestHoldingPct: share(sorted[0]?.valueBase ?? 0),
    topThreePct: share(sorted.slice(0, 3).reduce((sum, item) => sum + item.valueBase, 0)),
    technologyExposurePct: share(exposure((item) => item.instrument.sectors.includes("科技"))),
    defensiveExposurePct: share(exposure((item) => item.instrument.styles.includes("防御"))),
    currencyExposure: Object.fromEntries(Object.entries(currencyValues).map(([key, value]) => [key, share(value)])),
    valuations, dataConfidence: valuations.length ? Math.round(valuations.filter((item) => !item.estimated).length / valuations.length * 100) : 0,
  };
}

export function runStressTests(state: AppState, metrics = calculatePortfolioMetrics(state)): StressScenario[] {
  const sum = (test: (item: HoldingValuation) => boolean) => metrics.valuations.filter(test).reduce((total, item) => total + item.valueBase, 0);
  const tech = sum((item) => item.instrument.sectors.includes("科技"));
  const cnTech = sum((item) => item.instrument.market === "CN" && item.instrument.sectors.includes("科技"));
  const usTech = sum((item) => item.instrument.market === "US" && item.instrument.sectors.includes("科技"));
  const usd = sum((item) => item.instrument.currency === "USD");
  const largest = Math.max(0, ...metrics.valuations.map((item) => item.valueBase));
  const make = (id: string, name: string, impactAmount: number, assumptions: string[]): StressScenario => {
    const impactPct = metrics.totalAssets ? impactAmount / metrics.totalAssets * 100 : 0;
    return { id, name, impactAmount, impactPct, severity: Math.abs(impactPct) >= 8 ? "high" : Math.abs(impactPct) >= 4 ? "medium" : "low", assumptions };
  };
  return [
    make("tech-5", "科技资产整体下跌 5%", -tech * .05, ["按科技标签估算"]),
    make("tech-10", "科技资产整体下跌 10%", -tech * .1, ["未计算二阶相关性"]),
    make("tech-15", "科技资产整体下跌 15%", -tech * .15, ["压力情景而非预测"]),
    make("cn-us-tech", "中美科技同步下跌", -(cnTech * .1 + usTech * .12), ["A 股科技 -10%", "美股科技 -12%"]),
    make("fx", "人民币升值 5%", -usd * .05, ["美元资产折算下降 5%"]),
    make("largest", "第一大持仓下跌 20%", -largest * .2, ["仅作用于第一大持仓"]),
    make("vix", "VIX 急升", -metrics.investedValue * .06, ["风险资产统一估算 -6%"]),
    make("rates", "美债利率快速上升", -(usTech * .08 + cnTech * .03), ["美股科技 -8%", "A 股科技 -3%"]),
  ];
}

export function buildRiskActions(state: AppState, metrics = calculatePortfolioMetrics(state)): RiskAction[] {
  const actions: RiskAction[] = [];
  const totalLimit = metrics.totalAssets * state.settings.maxTotalPositionPct / 100;
  if (metrics.investedValue > totalLimit) {
    actions.push({ id: "total-position", priority: "high", title: "总仓位超过纪律线", reason: `当前 ${metrics.totalPositionPct.toFixed(1)}%，上限 ${state.settings.maxTotalPositionPct}%。`, action: "建立降仓计划并优先处理高集中持仓", amount: metrics.investedValue - totalLimit, instrumentId: null });
  }
  const singleLimit = metrics.totalAssets * state.settings.maxSinglePositionPct / 100;
  metrics.valuations.filter((item) => item.valueBase > singleLimit).sort((a, b) => b.valueBase - a.valueBase).forEach((item) => {
    actions.push({ id: `single-${item.instrument.id}`, priority: "high", title: `${item.instrument.symbol} 单仓超过上限`, reason: `占总资产 ${(item.valueBase / metrics.totalAssets * 100).toFixed(1)}%，上限 ${state.settings.maxSinglePositionPct}%。`, action: "建立该标的风险处置计划", amount: item.valueBase - singleLimit, instrumentId: item.instrument.id });
  });
  const classified = metrics.valuations.filter((item) => item.instrument.sectors.length || item.instrument.styles.length).length;
  if (classified < metrics.valuations.length) {
    actions.push({ id: "classification-gap", priority: "medium", title: "行业暴露仍有数据缺口", reason: `本地风险标签覆盖 ${classified}/${metrics.valuations.length}；科技暴露等分类指标可能被低估。`, action: "先补齐分类，再依据分类指标决策", amount: null, instrumentId: null });
  }
  if (metrics.dataConfidence < 100) {
    actions.push({ id: "quote-gap", priority: "medium", title: "部分持仓使用估算价格", reason: `有效行情覆盖率 ${metrics.dataConfidence}%。`, action: "刷新行情后重新同步风险警报", amount: null, instrumentId: null });
  }
  if (!actions.length) actions.push({ id: "within-limits", priority: "info", title: "当前未发现硬性超限", reason: "总仓位、最大单仓和行情覆盖均在现有规则内。", action: "保持观察并定期同步风险警报", amount: null, instrumentId: null });
  return actions;
}
