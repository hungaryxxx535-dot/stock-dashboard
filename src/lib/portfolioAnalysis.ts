import type { AShareHolding } from "@/data/portfolio";

export type AccountInput = {
  totalAssets: number;
  marketValue: number;
  availableCash: number;
  totalPnl: number;
  todayPnl: number;
  brokerPositionPct: number;
};

export type ThemeExposure = {
  name: string;
  marketValue: number;
  investedPct: number;
  totalPct: number;
  holdings: string[];
};

export type DimensionScore = {
  key: string;
  label: string;
  score: number;
  status: "优秀" | "正常" | "警惕" | "高风险";
  explanation: string;
};

export type HoldingInsight = {
  holding: AShareHolding;
  primaryTheme: string;
  overlapThemes: string[];
  investedWeight: number;
  totalWeight: number;
  pnlRate: number | null;
  riskLevel: "低" | "中" | "高";
  action: string;
  dataWarnings: string[];
};

export type StressScenario = {
  name: string;
  techShock: number;
  defensiveShock: number;
  estimatedLoss: number;
  accountImpactPct: number;
  remainingPnlBuffer: number;
};

export type PortfolioAnalysis = {
  investedValue: number;
  totalAssetsWithOffsiteCash: number;
  actualPositionPct: number;
  brokerPositionPct: number;
  cashPct: number;
  techPctOfInvested: number;
  defensivePctOfInvested: number;
  top3Pct: number;
  top5Pct: number;
  profitableCount: number;
  losingCount: number;
  holdingsPnl: number;
  positivePnl: number;
  negativePnl: number;
  topProfitDependencyPct: number;
  overallScore: number;
  overallLevel: "稳健" | "可控" | "偏集中" | "高风险";
  dimensions: DimensionScore[];
  themes: ThemeExposure[];
  topHoldings: HoldingInsight[];
  profitLeaders: HoldingInsight[];
  lossDrags: HoldingInsight[];
  holdingInsights: HoldingInsight[];
  stressScenarios: StressScenario[];
  priorities: string[];
  reviewConclusions: string[];
  dataCoverage: { dimension: string; status: "已覆盖" | "部分覆盖" | "未接入"; note: string }[];
};

const defensiveNames = /招商银行|黄金9999|黄金ETF|金ETF/;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function pct(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function primaryTheme(holding: AShareHolding): string {
  const name = holding.name;
  if (/澜起科技|科创芯50|科创半导|有研硅/.test(name)) return "半导体/芯片";
  if (/中际旭创|通信ETF/.test(name)) return "光通信/通信";
  if (/胜宏科技|中科曙光/.test(name)) return "算力硬件";
  if (/AI创业板/.test(name)) return "AI成长";
  if (/科创200/.test(name)) return "科创宽基";
  if (/京东方A/.test(name)) return "显示面板";
  if (/招商银行/.test(name)) return "银行防守";
  if (/黄金9999|黄金ETF|金ETF/.test(name)) return "黄金防守";
  return holding.type === "防守仓" ? "其他防守" : "其他成长";
}

function overlapThemes(holding: AShareHolding): string[] {
  const name = holding.name;
  const themes = new Set<string>();
  if (/澜起科技|科创芯50|科创半导|有研硅|科创200/.test(name)) themes.add("半导体周期");
  if (/中际旭创|通信ETF|胜宏科技|中科曙光|AI创业板/.test(name)) themes.add("AI算力链");
  if (/科创芯50|科创半导|科创200|AI创业板/.test(name)) themes.add("ETF重叠");
  if (/中际旭创|通信ETF/.test(name)) themes.add("光通信重叠");
  if (/招商银行|黄金9999|黄金ETF|金ETF/.test(name)) themes.add("防守资产");
  return [...themes];
}

function holdingAction(weight: number, pnlRate: number | null, holding: AShareHolding, overlaps: string[]): string {
  if (holding.costPrice <= 0) return "先校验成本口径，不依据收益率做加减仓判断";
  if (weight >= 15) return pnlRate !== null && pnlRate < -8 ? "大仓浮亏，优先设定减仓/止损纪律" : "单票权重偏高，暂停追涨加仓";
  if (overlaps.length >= 2 && weight >= 8) return "与现有科技仓重叠明显，只能做替换式加仓";
  if (pnlRate !== null && pnlRate <= -15) return "进入深度浮亏复盘，明确基本逻辑是否失效";
  if (pnlRate !== null && pnlRate >= 60) return "利润仓，采用移动止盈而非一次性清仓";
  if (holding.type === "防守仓") return "保留组合稳定器角色，避免被成长仓挤占";
  return "保持观察，等待实时行情和基本面信号确认";
}

function scoreStatus(score: number): DimensionScore["status"] {
  if (score >= 80) return "优秀";
  if (score >= 65) return "正常";
  if (score >= 45) return "警惕";
  return "高风险";
}

export function analyzePortfolio(
  holdings: AShareHolding[],
  account: AccountInput,
  offsiteCash: number,
): PortfolioAnalysis {
  const holdingsValue = holdings.reduce((sum, item) => sum + Math.max(0, item.marketValue), 0);
  const investedValue = account.marketValue || holdingsValue;
  const totalAssetsWithOffsiteCash = Math.max(0, account.totalAssets) + Math.max(0, offsiteCash);
  const actualPositionPct = pct(investedValue, totalAssetsWithOffsiteCash);
  const cashPct = pct(account.availableCash + offsiteCash, totalAssetsWithOffsiteCash);

  const holdingInsights: HoldingInsight[] = holdings.map((holding) => {
    const investedWeight = pct(holding.marketValue, investedValue);
    const totalWeight = pct(holding.marketValue, totalAssetsWithOffsiteCash);
    const costValue = holding.quantity * holding.costPrice;
    const pnlRate = holding.costPrice > 0 && costValue > 0 ? (holding.pnl / costValue) * 100 : null;
    const overlaps = overlapThemes(holding);
    const warnings: string[] = [];
    if (holding.costPrice < 0) warnings.push("成本价为负，通常包含历史减仓或累计收益，收益率不可直接比较");
    if (holding.costPrice === 0) warnings.push("成本价为0，无法计算有效收益率");
    if (holding.quantity <= 0) warnings.push("持仓数量异常或已清仓");
    if (holding.marketValue <= 0) warnings.push("持仓市值为0");
    const riskLevel: HoldingInsight["riskLevel"] =
      investedWeight >= 15 || (pnlRate !== null && pnlRate <= -15)
        ? "高"
        : investedWeight >= 8 || overlaps.length >= 2
          ? "中"
          : "低";
    return {
      holding,
      primaryTheme: primaryTheme(holding),
      overlapThemes: overlaps,
      investedWeight,
      totalWeight,
      pnlRate,
      riskLevel,
      action: holdingAction(investedWeight, pnlRate, holding, overlaps),
      dataWarnings: warnings,
    };
  });

  const sortedByValue = [...holdingInsights].sort((a, b) => b.holding.marketValue - a.holding.marketValue);
  const sortedByPnl = [...holdingInsights].sort((a, b) => b.holding.pnl - a.holding.pnl);
  const lossDrags = [...holdingInsights].filter((item) => item.holding.pnl < 0).sort((a, b) => a.holding.pnl - b.holding.pnl);
  const positivePnl = holdings.filter((item) => item.pnl > 0).reduce((sum, item) => sum + item.pnl, 0);
  const negativePnl = holdings.filter((item) => item.pnl < 0).reduce((sum, item) => sum + item.pnl, 0);
  const holdingsPnl = holdings.reduce((sum, item) => sum + item.pnl, 0);
  const top3Pct = sortedByValue.slice(0, 3).reduce((sum, item) => sum + item.investedWeight, 0);
  const top5Pct = sortedByValue.slice(0, 5).reduce((sum, item) => sum + item.investedWeight, 0);
  const defensiveValue = holdings.filter((item) => item.type === "防守仓" || defensiveNames.test(item.name)).reduce((sum, item) => sum + item.marketValue, 0);
  const defensivePctOfInvested = pct(defensiveValue, investedValue);
  const techPctOfInvested = 100 - defensivePctOfInvested;
  const topProfit3 = sortedByPnl.filter((item) => item.holding.pnl > 0).slice(0, 3).reduce((sum, item) => sum + item.holding.pnl, 0);
  const topProfitDependencyPct = positivePnl > 0 ? pct(topProfit3, positivePnl) : 0;

  const themeMap = new Map<string, ThemeExposure>();
  for (const insight of holdingInsights) {
    const existing = themeMap.get(insight.primaryTheme) ?? {
      name: insight.primaryTheme,
      marketValue: 0,
      investedPct: 0,
      totalPct: 0,
      holdings: [],
    };
    existing.marketValue += insight.holding.marketValue;
    existing.holdings.push(insight.holding.name);
    themeMap.set(insight.primaryTheme, existing);
  }
  const themes = [...themeMap.values()]
    .map((item) => ({
      ...item,
      investedPct: pct(item.marketValue, investedValue),
      totalPct: pct(item.marketValue, totalAssetsWithOffsiteCash),
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  const invalidDataCount = holdingInsights.filter((item) => item.dataWarnings.length > 0).length;
  const positionScore = clamp(100 - Math.abs(actualPositionPct - 60) * 1.4);
  const concentrationScore = clamp(105 - Math.max(0, top3Pct - 35) * 1.8 - Math.max(0, top5Pct - 65) * 0.7);
  const diversificationScore = clamp(100 - Math.max(0, techPctOfInvested - 60) * 1.5);
  const defenseScore = defensivePctOfInvested >= 15 && defensivePctOfInvested <= 35 ? 85 : clamp(65 - Math.abs(defensivePctOfInvested - 22) * 1.8);
  const profitabilityScore = clamp(55 + pct(positivePnl + negativePnl, Math.max(investedValue, 1)) * 1.2 + (holdings.filter((item) => item.pnl > 0).length / Math.max(holdings.length, 1)) * 25);
  const dataQualityScore = clamp(100 - invalidDataCount * 12);

  const dimensions: DimensionScore[] = [
    { key: "position", label: "仓位控制", score: positionScore, status: scoreStatus(positionScore), explanation: `纳入场外现金后的A股仓位约${actualPositionPct.toFixed(1)}%。` },
    { key: "concentration", label: "单票集中度", score: concentrationScore, status: scoreStatus(concentrationScore), explanation: `前三大持仓占已投资市值${top3Pct.toFixed(1)}%，前五大占${top5Pct.toFixed(1)}%。` },
    { key: "diversification", label: "主题分散度", score: diversificationScore, status: scoreStatus(diversificationScore), explanation: `成长科技资产占A股持仓${techPctOfInvested.toFixed(1)}%。` },
    { key: "defense", label: "防守配置", score: defenseScore, status: scoreStatus(defenseScore), explanation: `银行和黄金等防守资产占A股持仓${defensivePctOfInvested.toFixed(1)}%。` },
    { key: "profitability", label: "盈利质量", score: profitabilityScore, status: scoreStatus(profitabilityScore), explanation: `盈利标的${holdings.filter((item) => item.pnl > 0).length}只，亏损标的${holdings.filter((item) => item.pnl < 0).length}只；前三大利润来源占正收益${topProfitDependencyPct.toFixed(1)}%。` },
    { key: "data", label: "数据可用性", score: dataQualityScore, status: scoreStatus(dataQualityScore), explanation: `${invalidDataCount}只持仓存在负成本、零成本或其他口径异常。` },
  ];
  const overallScore = dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length;
  const overallLevel: PortfolioAnalysis["overallLevel"] =
    overallScore >= 80 ? "稳健" : overallScore >= 65 ? "可控" : overallScore >= 50 ? "偏集中" : "高风险";

  const techValue = investedValue - defensiveValue;
  const scenarios: [string, number, number][] = [
    ["轻度回撤", -5, -2],
    ["中度回撤", -10, -3],
    ["压力情景", -15, -5],
  ];
  const stressScenarios = scenarios.map(([name, techShock, defensiveShock]) => {
    const estimatedLoss = techValue * (techShock / 100) + defensiveValue * (defensiveShock / 100);
    return {
      name,
      techShock,
      defensiveShock,
      estimatedLoss,
      accountImpactPct: pct(estimatedLoss, totalAssetsWithOffsiteCash),
      remainingPnlBuffer: account.totalPnl + estimatedLoss,
    };
  });

  const priorities: string[] = [];
  if (top3Pct > 50) priorities.push(`前三大持仓占比${top3Pct.toFixed(1)}%，新增资金优先投向低相关方向，不再机械加码前三大。`);
  if (techPctOfInvested > 70) priorities.push(`科技成长占持仓${techPctOfInvested.toFixed(1)}%，半导体、算力和通信需按同一风险簇管理。`);
  if (topProfitDependencyPct > 75) priorities.push(`前三大利润来源贡献正收益${topProfitDependencyPct.toFixed(1)}%，需要移动止盈保护历史利润。`);
  if (defensivePctOfInvested < 15) priorities.push("防守资产比例偏低，新增仓位应优先考虑与科技低相关的稳定资产。" );
  if (invalidDataCount > 0) priorities.push(`${invalidDataCount}只持仓成本口径异常，复盘时不得直接用浮盈百分比排序。`);
  if (lossDrags.length > 0) priorities.push(`优先复盘亏损拖累最大的${lossDrags.slice(0, 3).map((item) => item.holding.name).join("、")}，逐项确认逻辑是否仍成立。`);
  if (!priorities.length) priorities.push("当前组合未触发重大结构预警，继续维持仓位纪律并等待实时信号。" );

  const reviewConclusions = [
    `组合不是高仓位问题，而是方向集中问题：真实A股仓位约${actualPositionPct.toFixed(1)}%，但科技成长占已投资市值${techPctOfInvested.toFixed(1)}%。`,
    `账户盈利依赖少数科技核心仓，前三大利润来源占正收益${topProfitDependencyPct.toFixed(1)}%，应把利润保护置于新增追涨之前。`,
    `前三大持仓占${top3Pct.toFixed(1)}%，单票与主题风险需要同时管理，不能只看每只股票的独立仓位。`,
    `当前分析基于持仓截图，不包含实时技术面、最新财报、估值和资金流，任何具体买卖点必须等待这些数据接入。`,
  ];

  return {
    investedValue,
    totalAssetsWithOffsiteCash,
    actualPositionPct,
    brokerPositionPct: account.brokerPositionPct,
    cashPct,
    techPctOfInvested,
    defensivePctOfInvested,
    top3Pct,
    top5Pct,
    profitableCount: holdings.filter((item) => item.pnl > 0).length,
    losingCount: holdings.filter((item) => item.pnl < 0).length,
    holdingsPnl,
    positivePnl,
    negativePnl,
    topProfitDependencyPct,
    overallScore,
    overallLevel,
    dimensions,
    themes,
    topHoldings: sortedByValue.slice(0, 8),
    profitLeaders: sortedByPnl.filter((item) => item.holding.pnl > 0).slice(0, 5),
    lossDrags: lossDrags.slice(0, 5),
    holdingInsights,
    stressScenarios,
    priorities,
    reviewConclusions,
    dataCoverage: [
      { dimension: "持仓与仓位结构", status: "已覆盖", note: "基于最新持仓截图、账户资金和场外现金。" },
      { dimension: "集中度与主题暴露", status: "已覆盖", note: "按单票、前三大、前五大和主题风险簇计算。" },
      { dimension: "盈利贡献与亏损拖累", status: "已覆盖", note: "基于截图累计盈亏，负成本与零成本单独提示。" },
      { dimension: "压力测试", status: "部分覆盖", note: "当前为静态情景测算，尚未使用历史波动率和相关系数。" },
      { dimension: "基本面与财报", status: "未接入", note: "后续接财务数据后再评分，当前不伪造基本面结论。" },
      { dimension: "估值", status: "未接入", note: "后续接PE、PEG、EV/EBITDA和历史分位。" },
      { dimension: "资金面与机构动向", status: "未接入", note: "后续接北向、融资融券、基金持仓和大单数据。" },
      { dimension: "技术面与实时买卖点", status: "未接入", note: "需要实时行情、K线和成交量，当前截图价格不能替代。" },
      { dimension: "宏观与行业景气", status: "未接入", note: "后续接宏观、产业链价格和行业事件数据。" },
    ],
  };
}

export function compareHoldings(current: AShareHolding[], baseline: AShareHolding[]) {
  const currentMap = new Map(current.map((item) => [item.code, item]));
  const baselineMap = new Map(baseline.map((item) => [item.code, item]));
  const codes = new Set([...currentMap.keys(), ...baselineMap.keys()]);
  return [...codes]
    .map((code) => {
      const now = currentMap.get(code);
      const before = baselineMap.get(code);
      return {
        code,
        name: now?.name ?? before?.name ?? code,
        quantityChange: (now?.quantity ?? 0) - (before?.quantity ?? 0),
        marketValueChange: (now?.marketValue ?? 0) - (before?.marketValue ?? 0),
        status: !before ? "新增" : !now ? "清仓" : (now.quantity ?? 0) > (before.quantity ?? 0) ? "加仓" : (now.quantity ?? 0) < (before.quantity ?? 0) ? "减仓" : "不变",
      };
    })
    .filter((item) => item.status !== "不变" || Math.abs(item.marketValueChange) > 1)
    .sort((a, b) => Math.abs(b.marketValueChange) - Math.abs(a.marketValueChange));
}
