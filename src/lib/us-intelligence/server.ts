import { usHoldings } from "@/data/portfolio";
import { getUsCloseFromApi } from "@/lib/usCloseApi";
import type {
  UsBenchmark,
  UsHoldingDecision,
  UsMacroIndicator,
  UsMarketIntelligence,
  UsMarketRegime,
  UsNewsItem,
} from "./types";

const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc";

const nowIso = () => new Date().toISOString();

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function finite(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "" || value === ".") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "text/csv,text/plain,*/*" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

type FredRow = { date: string; value: number };

async function fredSeries(seriesId: string, lookbackDays = 420): Promise<FredRow[]> {
  const url = new URL(FRED_CSV);
  url.searchParams.set("id", seriesId);
  url.searchParams.set("cosd", daysAgoIso(lookbackDays));
  const csv = await fetchText(url.toString());
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, raw] = line.split(",");
      return { date, value: finite(raw) };
    })
    .filter((row): row is FredRow => row.value !== null);
}

async function loadBenchmarks(): Promise<{ benchmarks: UsBenchmark[]; warnings: string[] }> {
  const targets = [
    ["SP500", "标普500"],
    ["NASDAQCOM", "纳斯达克综合指数"],
    ["DJIA", "道琼斯工业指数"],
  ] as const;
  const results = await Promise.allSettled(targets.map(([id]) => fredSeries(id, 120)));
  const warnings: string[] = [];
  const benchmarks: UsBenchmark[] = [];
  results.forEach((result, index) => {
    const [id, name] = targets[index];
    if (result.status === "rejected") {
      warnings.push(`${name}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
      return;
    }
    const rows = result.value;
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const prior20 = rows.at(-21) ?? rows.at(0);
    benchmarks.push({
      id: id.toLowerCase(),
      name,
      value: latest?.value ?? null,
      date: latest?.date ?? "",
      change1d: changePct(latest?.value ?? null, previous?.value ?? null),
      change20d: changePct(latest?.value ?? null, prior20?.value ?? null),
      source: "FRED官方公开序列",
    });
  });
  return { benchmarks, warnings };
}

async function loadMacro(): Promise<{ macro: UsMacroIndicator[]; warnings: string[] }> {
  const targets = [
    ["VIXCLS", "VIX恐慌指数", "点", 120],
    ["DGS10", "美国10年期国债收益率", "%", 120],
    ["DGS2", "美国2年期国债收益率", "%", 120],
    ["DFF", "有效联邦基金利率", "%", 120],
    ["BAMLH0A0HYM2", "美国高收益债利差", "%", 180],
    ["DTWEXBGS", "美元广义指数", "点", 180],
    ["CPIAUCSL", "美国CPI同比", "%", 500],
    ["UNRATE", "美国失业率", "%", 500],
  ] as const;
  const results = await Promise.allSettled(targets.map(([, , , days,], index) => fredSeries(targets[index][0], days)));
  const warnings: string[] = [];
  const macro: UsMacroIndicator[] = [];

  results.forEach((result, index) => {
    const [id, name, unit] = targets[index];
    if (result.status === "rejected") {
      warnings.push(`${name}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
      return;
    }
    const rows = result.value;
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    let value = latest?.value ?? null;
    let previousValue = previous?.value ?? null;
    let interpretation = "用于判断美股宏观环境。";

    if (id === "CPIAUCSL") {
      const yearAgo = rows.at(-13);
      const priorYearAgo = rows.at(-14);
      value = changePct(latest?.value ?? null, yearAgo?.value ?? null);
      previousValue = changePct(previous?.value ?? null, priorYearAgo?.value ?? null);
      interpretation = value === null ? "通胀数据不足" : value <= 2.5 ? "通胀压力相对可控，利率约束边际减弱" : value >= 3.5 ? "通胀仍偏高，降息预期容易反复" : "通胀处于中间区间，需结合就业和核心通胀";
    } else if (id === "VIXCLS") {
      interpretation = value === null ? "波动率数据不足" : value < 18 ? "市场风险偏好较稳定" : value >= 30 ? "市场处于明显避险状态" : "市场波动偏高，追涨胜率下降";
    } else if (id === "DGS10") {
      interpretation = value === null ? "利率数据不足" : value >= 4.5 ? "长端利率偏高，对科技成长估值形成压力" : value <= 3.5 ? "长端利率较低，对成长估值相对友好" : "长端利率处于中间区间";
    } else if (id === "BAMLH0A0HYM2") {
      interpretation = value === null ? "信用利差数据不足" : value >= 5 ? "信用风险溢价明显上升，风险资产承压" : value <= 3.5 ? "信用环境相对稳定" : "信用利差处于正常偏高区间";
    } else if (id === "UNRATE") {
      interpretation = value === null ? "就业数据不足" : value >= 5 ? "失业率偏高，增长风险上升" : "就业市场仍具韧性";
    } else if (id === "DFF") {
      interpretation = value === null ? "政策利率数据不足" : value >= 4 ? "政策利率仍偏紧，估值扩张需要盈利支撑" : "政策利率约束相对缓和";
    }

    macro.push({
      id: id.toLowerCase(),
      name,
      value,
      previous: previousValue,
      unit,
      date: latest?.date ?? "",
      interpretation,
      source: "FRED官方公开序列",
    });
  });

  const ten = macro.find((item) => item.id === "dgs10")?.value;
  const two = macro.find((item) => item.id === "dgs2")?.value;
  if (ten !== undefined && ten !== null && two !== undefined && two !== null) {
    const spread = ten - two;
    macro.push({
      id: "us_2s10s",
      name: "美债2Y-10Y利差",
      value: spread,
      previous: null,
      unit: "百分点",
      date: macro.find((item) => item.id === "dgs10")?.date ?? "",
      interpretation: spread < 0 ? "收益率曲线倒挂，增长预期仍偏谨慎" : "收益率曲线为正，衰退定价压力相对减弱",
      source: "FRED官方公开序列",
    });
  }
  return { macro, warnings };
}

type GdeltResponse = { articles?: { url?: string; title?: string; seendate?: string; domain?: string }[] };

const newsQueries: { category: UsNewsItem["category"]; query: string }[] = [
  { category: "美联储与利率", query: '(Federal Reserve OR Fed rate OR US inflation OR Treasury yields)' },
  { category: "美股市场", query: '(S&P 500 OR Nasdaq OR Wall Street OR US stocks)' },
  { category: "AI与半导体", query: '(AMD OR Intel OR semiconductor OR AI infrastructure OR data center OR optical networking)' },
  { category: "中概股", query: '(PDD OR Tencent Music OR China ADR OR Chinese stocks US listed)' },
  { category: "持仓相关", query: '(META OR AMD OR ANET OR Amphenol OR Rambus OR Intel OR PDD OR Tencent Music OR Microsoft)' },
];

function classifyImpact(title: string): UsNewsItem["impact"] {
  const text = title.toLowerCase();
  const positive = ["rally", "surge", "beat", "raises guidance", "record", "growth", "rate cut", "approval", "upgrade", "strong demand"];
  const negative = ["selloff", "drop", "miss", "cuts guidance", "tariff", "restriction", "probe", "lawsuit", "downgrade", "weak demand", "sanction"];
  if (positive.some((word) => text.includes(word))) return "利多";
  if (negative.some((word) => text.includes(word))) return "利空";
  return "待判断";
}

function relatedSymbols(title: string): string[] {
  const mappings: [RegExp, string][] = [
    [/\bAMD\b|advanced micro devices/i, "AMD"],
    [/\bMETA\b|meta platforms|facebook/i, "META"],
    [/\bANET\b|arista networks|ethernet networking/i, "ANET"],
    [/\bAPH\b|amphenol|connector/i, "APH"],
    [/\bRMBS\b|rambus|memory interface/i, "RMBS"],
    [/\bINTC\b|intel/i, "INTC"],
    [/\bPDD\b|pinduoduo|temu/i, "PDD"],
    [/\bTME\b|tencent music/i, "TME"],
    [/microsoft|\bMSFT\b/i, "MSFU"],
  ];
  return mappings.filter(([pattern]) => pattern.test(title)).map(([, symbol]) => symbol);
}

async function loadNews(): Promise<{ news: UsNewsItem[]; warnings: string[] }> {
  const results = await Promise.allSettled(newsQueries.map(async ({ category, query }) => {
    const url = new URL(GDELT_DOC);
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "ArtList");
    url.searchParams.set("maxrecords", "20");
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "HybridRel");
    url.searchParams.set("timespan", "24h");
    const payload = await fetchJson<GdeltResponse>(url.toString());
    return (payload.articles ?? []).map((article, index) => ({
      id: `${category}-${article.url ?? article.title ?? index}`,
      title: article.title?.trim() || "未命名新闻",
      url: article.url || "",
      domain: article.domain || "未知来源",
      publishedAt: article.seendate || "",
      category,
      impact: classifyImpact(article.title || ""),
      relatedSymbols: relatedSymbols(article.title || ""),
      source: "GDELT DOC 2.0",
    } satisfies UsNewsItem));
  }));

  const warnings: string[] = [];
  const map = new Map<string, UsNewsItem>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") result.value.forEach((item) => { if (item.url) map.set(item.url, item); });
    else warnings.push(`${newsQueries[index].category}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
  });
  const news = [...map.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 50);
  return { news, warnings };
}

function sectorFor(symbol: string): string {
  if (["AMD", "INTC", "RMBS"].includes(symbol)) return "半导体";
  if (["ANET", "APH"].includes(symbol)) return "AI基础设施";
  if (symbol === "META") return "互联网平台/AI应用";
  if (["PDD", "TME"].includes(symbol)) return "中概互联网";
  if (symbol === "MSFU") return "微软杠杆ETF";
  return "其他";
}

function sensitivityFor(symbol: string): string[] {
  const common: Record<string, string[]> = {
    AMD: ["AI芯片需求", "美债利率", "出口限制", "半导体周期"],
    INTC: ["晶圆代工执行", "美国补贴", "PC周期", "资本开支"],
    RMBS: ["存储周期", "DDR/CXL渗透", "半导体估值"],
    ANET: ["云厂商资本开支", "AI网络升级", "高估值波动"],
    APH: ["数据中心连接器", "工业周期", "并购整合"],
    META: ["广告增长", "AI资本开支", "监管", "长端利率"],
    PDD: ["中国消费", "Temu关税", "中美关系", "中概风险偏好"],
    TME: ["中国线上娱乐消费", "会员增长", "中概风险偏好"],
    MSFU: ["微软股价", "杠杆衰减", "美债利率", "AI估值"],
  };
  return common[symbol] ?? ["市场风险偏好"];
}

function regimeScore(benchmarks: UsBenchmark[], macro: UsMacroIndicator[], weightedChange: number | null, news: UsNewsItem[]): UsMarketRegime {
  let score = 50;
  let evidence = 0;
  const reasons: string[] = [];

  const benchmark20 = benchmarks.filter((item) => item.change20d !== null);
  if (benchmark20.length) {
    const average = benchmark20.reduce((sum, item) => sum + (item.change20d ?? 0), 0) / benchmark20.length;
    score += Math.max(-16, Math.min(16, average * 1.6));
    evidence += 2;
    reasons.push(`主要美股指数20日平均涨跌${average >= 0 ? "+" : ""}${average.toFixed(2)}%`);
  }

  const vix = macro.find((item) => item.id === "vixcls")?.value;
  if (vix !== undefined && vix !== null) {
    score += vix < 18 ? 9 : vix >= 30 ? -15 : vix >= 22 ? -7 : 1;
    evidence += 1;
    reasons.push(`VIX为${vix.toFixed(1)}`);
  }

  const tenYear = macro.find((item) => item.id === "dgs10")?.value;
  if (tenYear !== undefined && tenYear !== null) {
    score += tenYear >= 4.5 ? -8 : tenYear <= 3.5 ? 5 : 0;
    evidence += 1;
    reasons.push(`10年期美债收益率${tenYear.toFixed(2)}%`);
  }

  const highYield = macro.find((item) => item.id === "bamlh0a0hym2")?.value;
  if (highYield !== undefined && highYield !== null) {
    score += highYield >= 5 ? -10 : highYield <= 3.5 ? 6 : -1;
    evidence += 1;
    reasons.push(`高收益债利差${highYield.toFixed(2)}%`);
  }

  if (weightedChange !== null) {
    score += Math.max(-8, Math.min(8, weightedChange * 2));
    evidence += 1;
    reasons.push(`你的美股持仓加权日涨跌${weightedChange >= 0 ? "+" : ""}${weightedChange.toFixed(2)}%`);
  }

  if (news.length) {
    const positive = news.filter((item) => item.impact === "利多").length;
    const negative = news.filter((item) => item.impact === "利空").length;
    score += Math.max(-6, Math.min(6, (positive - negative) * 0.6));
    evidence += 1;
    reasons.push(`过去24小时规则初筛利多${positive}条、利空${negative}条`);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  if (evidence < 3) return { label: "数据不足", score: null, confidence: Math.round((evidence / 7) * 100), reasons, actionBias: "外部证据不足，暂不依据系统评分调整美股仓位。" };
  const label: UsMarketRegime["label"] = score >= 63 ? "风险偏好改善" : score <= 42 ? "风险偏好收缩" : "震荡中性";
  const actionBias = label === "风险偏好改善" ? "可以持有强趋势核心仓，并寻找回踩确认后的机会；不追逐单日急涨。" : label === "风险偏好收缩" ? "优先保护利润、降低杠杆和高估值暴露，止损线优先于主观判断。" : "以持有和结构调整为主，等待指数、利率与盈利预期形成同向信号。";
  return { label, score, confidence: Math.min(100, 35 + evidence * 9), reasons, actionBias };
}

function decisionForHolding(
  holding: (typeof usHoldings)[number],
  close: number | null,
  dailyChange: number | null,
  portfolioWeight: number,
  regime: UsMarketRegime,
  news: UsNewsItem[],
): UsHoldingDecision {
  const relevant = news.filter((item) => item.relatedSymbols.includes(holding.code));
  const positiveNews = relevant.filter((item) => item.impact === "利多").length;
  const negativeNews = relevant.filter((item) => item.impact === "利空").length;
  const distanceToStopPct = close && holding.stopLoss > 0 ? ((close - holding.stopLoss) / close) * 100 : null;
  const distanceToTargetPct = close && holding.targetPrice > 0 ? ((holding.targetPrice - close) / close) * 100 : null;
  const rationale: string[] = [];
  let signal: UsHoldingDecision["signal"] = "持有观察";

  if (close === null) {
    signal = "数据不足";
    rationale.push("收盘价接口未返回有效数据");
  } else if (close <= holding.stopLoss || (distanceToStopPct !== null && distanceToStopPct <= 2)) {
    signal = holding.type === "杠杆仓" ? "严格风控" : "减仓复核";
    rationale.push(`距离止损线仅${distanceToStopPct?.toFixed(1) ?? "—"}%`);
  } else if (holding.type === "杠杆仓" && regime.label !== "风险偏好改善") {
    signal = "严格风控";
    rationale.push("杠杆仓在非风险偏好改善环境中不宜补跌");
  } else if (regime.label === "风险偏好收缩" && (portfolioWeight >= 12 || holding.type === "趋势仓")) {
    signal = "减仓复核";
    rationale.push("市场环境偏防守，较大或高贝塔仓位需要优先保护利润");
  } else if (regime.label === "风险偏好改善" && positiveNews > negativeNews && (dailyChange ?? 0) >= -1 && (distanceToTargetPct ?? 0) >= 5) {
    signal = "进攻候选";
    rationale.push("市场风险偏好改善且相关新闻初筛偏正面");
  } else {
    rationale.push(`当前市场状态为${regime.label}`);
  }

  if (portfolioWeight >= 35) rationale.push(`单票占美股持仓${portfolioWeight.toFixed(1)}%，任何动作都应考虑账户级影响`);
  if (negativeNews > positiveNews) rationale.push(`过去24小时直接相关新闻利空${negativeNews}条、利多${positiveNews}条`);
  if (dailyChange !== null) rationale.push(`最近收盘涨跌${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}%`);

  return {
    symbol: holding.code,
    name: holding.name,
    close,
    changePct: dailyChange,
    quantity: holding.quantity,
    marketValue: close === null ? holding.marketValue : close * holding.quantity,
    portfolioWeight,
    stopLoss: holding.stopLoss,
    targetPrice: holding.targetPrice,
    distanceToStopPct,
    distanceToTargetPct,
    sector: sectorFor(holding.code),
    sensitivity: sensitivityFor(holding.code),
    newsCount: relevant.length,
    positiveNews,
    negativeNews,
    signal,
    rationale,
  };
}

export async function getUsMarketIntelligence(): Promise<UsMarketIntelligence> {
  const [closeResult, benchmarkResult, macroResult, newsResult] = await Promise.all([
    getUsCloseFromApi(),
    loadBenchmarks(),
    loadMacro(),
    loadNews(),
  ]);

  const quoteMap = new Map(closeResult.quotes.map((quote) => [quote.symbol, quote]));
  const holdingRows = usHoldings.map((holding) => {
    const quote = quoteMap.get(holding.code);
    const close = finite(quote?.close ?? holding.currentPrice);
    const value = close === null ? holding.marketValue : close * holding.quantity;
    return { holding, close, changePct: finite(quote?.changePct), value };
  });
  const totalValue = holdingRows.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const weightedChangeNumerator = holdingRows.reduce((sum, item) => sum + (item.changePct ?? 0) * item.value, 0);
  const weightedChangeDenominator = holdingRows.filter((item) => item.changePct !== null).reduce((sum, item) => sum + item.value, 0);
  const weightedChangePct = weightedChangeDenominator > 0 ? weightedChangeNumerator / weightedChangeDenominator : null;
  const regime = regimeScore(benchmarkResult.benchmarks, macroResult.macro, weightedChangePct, newsResult.news);

  const holdings = holdingRows
    .map(({ holding, close, changePct, value }) => decisionForHolding(holding, close, changePct, totalValue > 0 ? (value / totalValue) * 100 : 0, regime, newsResult.news))
    .sort((a, b) => b.marketValue - a.marketValue);
  const sortedWeights = holdings.map((item) => item.portfolioWeight).sort((a, b) => b - a);
  const aiInfrastructureWeight = holdings.filter((item) => ["AMD", "INTC", "RMBS", "ANET", "APH", "META", "MSFU"].includes(item.symbol)).reduce((sum, item) => sum + item.portfolioWeight, 0);
  const chinaAdrWeight = holdings.filter((item) => ["PDD", "TME"].includes(item.symbol)).reduce((sum, item) => sum + item.portfolioWeight, 0);
  const leveragedWeight = holdings.filter((item) => item.symbol === "MSFU").reduce((sum, item) => sum + item.portfolioWeight, 0);

  const conclusions = [
    `${regime.label}：${regime.actionBias}`,
    `美股持仓中AI与数字基础设施相关权重约${aiInfrastructureWeight.toFixed(1)}%，宏观上最需要跟踪长端美债收益率、VIX和云厂商资本开支。`,
    `第一大持仓占比约${(sortedWeights[0] ?? 0).toFixed(1)}%，前三大占比约${sortedWeights.slice(0, 3).reduce((sum, value) => sum + value, 0).toFixed(1)}%，需要把市场判断转换成账户级仓位动作。`,
    `中概股权重约${chinaAdrWeight.toFixed(1)}%，其驱动与美股科技不同，重点受中国消费、关税和中美关系影响。`,
  ];

  return {
    generatedAt: nowIso(),
    tradingDate: closeResult.tradingDate,
    quoteStatus: closeResult.status,
    quoteSource: closeResult.source,
    regime,
    benchmarks: benchmarkResult.benchmarks,
    macro: macroResult.macro,
    news: newsResult.news,
    holdings,
    portfolio: {
      totalValue,
      weightedChangePct,
      top1Weight: sortedWeights[0] ?? 0,
      top3Weight: sortedWeights.slice(0, 3).reduce((sum, value) => sum + value, 0),
      positiveCount: holdings.filter((item) => (item.changePct ?? 0) > 0).length,
      negativeCount: holdings.filter((item) => (item.changePct ?? 0) < 0).length,
      aiInfrastructureWeight,
      chinaAdrWeight,
      leveragedWeight,
    },
    conclusions,
    warnings: [...benchmarkResult.warnings, ...macroResult.warnings, ...newsResult.warnings, ...(closeResult.status === "updated" ? [] : [closeResult.description])],
  };
}
