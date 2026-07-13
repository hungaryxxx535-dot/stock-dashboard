import type { MacroIndicator, NewsItem, SourceStatus } from "@/lib/market-intelligence/types";

const FRED_CSV_ENDPOINT = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export type UsMarketIntelligence = {
  generatedAt: string;
  macro: MacroIndicator[];
  news: NewsItem[];
  sourceStatus: SourceStatus[];
  warnings: string[];
};

type FredObservation = { date: string; value: number };
type GdeltArticle = { url?: string; title?: string; seendate?: string; domain?: string };
type GdeltResponse = { articles?: GdeltArticle[] };

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

async function fredSeries(seriesId: string): Promise<FredObservation[]> {
  const url = new URL(FRED_CSV_ENDPOINT);
  url.searchParams.set("id", seriesId);
  const csv = await fetchText(url.toString());
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const commaIndex = line.indexOf(",");
      const date = commaIndex >= 0 ? line.slice(0, commaIndex) : "";
      const raw = commaIndex >= 0 ? line.slice(commaIndex + 1) : "";
      const value = Number(raw);
      return { date, value };
    })
    .filter((item) => item.date && Number.isFinite(item.value))
    .reverse();
}

function dailyChange(series: FredObservation[]): number | null {
  const [latest, previous] = series;
  if (!latest || !previous || previous.value === 0) return null;
  return ((latest.value / previous.value) - 1) * 100;
}

function direction(value: number | null): MacroIndicator["direction"] {
  if (value === null) return "unknown";
  if (Math.abs(value) < 1e-9) return "flat";
  return value > 0 ? "up" : "down";
}

async function loadFredUsMacro(): Promise<{ macro: MacroIndicator[]; status: SourceStatus; warnings: string[] }> {
  const targets = ["SP500", "NASDAQCOM", "VIXCLS", "DGS10", "DGS2", "DFF", "CPIAUCSL", "UNRATE", "PAYEMS"] as const;
  const results = await Promise.allSettled(targets.map((id) => fredSeries(id)));
  const seriesMap = new Map<string, FredObservation[]>();
  const warnings: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") seriesMap.set(targets[index], result.value);
    else warnings.push(`${targets[index]}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
  });

  const macro: MacroIndicator[] = [];
  const pushDailyIndex = (id: string, seriesId: string, name: string) => {
    const series = seriesMap.get(seriesId) ?? [];
    const change = dailyChange(series);
    macro.push({
      id,
      name,
      value: change,
      previous: null,
      unit: "%",
      period: series[0]?.date ?? "",
      direction: direction(change),
      interpretation: change === null ? "数据缺失" : change > 1 ? "指数当日明显走强" : change < -1 ? "指数当日明显承压" : "指数当日处于震荡区间",
      source: "FRED官方公开序列",
    });
  };

  pushDailyIndex("sp500_change", "SP500", "标普500日涨跌");
  pushDailyIndex("nasdaq_change", "NASDAQCOM", "纳斯达克综合指数日涨跌");

  const vix = seriesMap.get("VIXCLS") ?? [];
  macro.push({
    id: "vixcls",
    name: "VIX恐慌指数",
    value: vix[0]?.value ?? null,
    previous: vix[1]?.value ?? null,
    unit: "点",
    period: vix[0]?.date ?? "",
    direction: vix[0] && vix[1] ? direction(vix[0].value - vix[1].value) : "unknown",
    interpretation: !vix[0] ? "数据缺失" : vix[0].value < 20 ? "美股波动率相对温和" : vix[0].value >= 30 ? "避险情绪显著升温" : "市场波动率偏高",
    source: "FRED官方公开序列",
  });

  for (const [seriesId, id, name] of [
    ["DGS10", "dgs10", "美国10年期国债收益率"],
    ["DGS2", "dgs2", "美国2年期国债收益率"],
    ["DFF", "dff", "美国有效联邦基金利率"],
  ] as const) {
    const series = seriesMap.get(seriesId) ?? [];
    macro.push({
      id,
      name,
      value: series[0]?.value ?? null,
      previous: series[1]?.value ?? null,
      unit: "%",
      period: series[0]?.date ?? "",
      direction: series[0] && series[1] ? direction(series[0].value - series[1].value) : "unknown",
      interpretation: !series[0] ? "数据缺失" : id === "dgs10" && series[0].value >= 4.5 ? "长端利率偏高，对科技成长估值构成压力" : id === "dff" && series[0].value >= 4 ? "政策利率仍处高位，流动性环境偏紧" : "利率环境相对可控",
      source: "FRED官方公开序列",
    });
  }

  const ten = macro.find((item) => item.id === "dgs10")?.value;
  const two = macro.find((item) => item.id === "dgs2")?.value;
  if (ten !== undefined && ten !== null && two !== undefined && two !== null) {
    const spread = ten - two;
    macro.push({
      id: "us_2s10s",
      name: "美债2年—10年利差",
      value: spread,
      previous: null,
      unit: "百分点",
      period: macro.find((item) => item.id === "dgs10")?.period ?? "",
      direction: "unknown",
      interpretation: spread < 0 ? "收益率曲线倒挂，增长预期仍偏谨慎" : "收益率曲线为正，衰退定价压力相对缓和",
      source: "FRED官方公开序列",
    });
  }

  const cpi = seriesMap.get("CPIAUCSL") ?? [];
  const cpiMom = dailyChange(cpi);
  macro.push({
    id: "us_cpi_mom",
    name: "美国CPI月环比",
    value: cpiMom,
    previous: null,
    unit: "%",
    period: cpi[0]?.date ?? "",
    direction: direction(cpiMom),
    interpretation: cpiMom === null ? "数据缺失" : cpiMom >= 0.4 ? "通胀环比偏热，降息预期可能受压" : cpiMom <= 0.2 ? "通胀环比相对温和" : "通胀环比处于中间区间",
    source: "FRED官方公开序列",
  });

  const unemployment = seriesMap.get("UNRATE") ?? [];
  macro.push({
    id: "us_unrate",
    name: "美国失业率",
    value: unemployment[0]?.value ?? null,
    previous: unemployment[1]?.value ?? null,
    unit: "%",
    period: unemployment[0]?.date ?? "",
    direction: unemployment[0] && unemployment[1] ? direction(unemployment[0].value - unemployment[1].value) : "unknown",
    interpretation: !unemployment[0] ? "数据缺失" : unemployment[0].value >= 5 ? "就业市场明显走弱" : unemployment[0].value >= 4.3 ? "就业市场边际降温" : "就业市场仍具韧性",
    source: "FRED官方公开序列",
  });

  const payroll = seriesMap.get("PAYEMS") ?? [];
  const payrollChange = payroll[0] && payroll[1] ? payroll[0].value - payroll[1].value : null;
  macro.push({
    id: "us_payroll_change",
    name: "美国非农就业月增量",
    value: payrollChange,
    previous: null,
    unit: "千人",
    period: payroll[0]?.date ?? "",
    direction: direction(payrollChange),
    interpretation: payrollChange === null ? "数据缺失" : payrollChange >= 200 ? "就业增长较强，经济韧性较高但降息空间可能受限" : payrollChange < 75 ? "就业增长偏弱，需关注经济下行风险" : "就业增长处于温和区间",
    source: "FRED官方公开序列",
  });

  return {
    macro,
    warnings,
    status: {
      id: "fred-us",
      name: "FRED美股宏观与指数",
      status: macro.some((item) => item.value !== null) ? (warnings.length ? "partial" : "online") : "error",
      updatedAt: new Date().toISOString(),
      message: `已读取${macro.filter((item) => item.value !== null).length}项美股市场与宏观指标`,
    },
  };
}

function classifyImpact(title: string): NewsItem["impact"] {
  const text = title.toLowerCase();
  const positive = ["beat", "raises guidance", "record", "surge", "rally", "upgrade", "approval", "growth", "rate cut", "降息", "上调", "增长", "创新高"];
  const negative = ["miss", "cuts guidance", "warning", "drop", "selloff", "downgrade", "probe", "tariff", "sanction", "layoff", "下调", "调查", "关税", "制裁"];
  if (positive.some((word) => text.includes(word))) return "利多";
  if (negative.some((word) => text.includes(word))) return "利空";
  return "待判断";
}

function relevance(title: string): string[] {
  const tags = new Set<string>();
  const mappings: [RegExp, string][] = [
    [/\bAMD\b|advanced micro devices/i, "AMD"],
    [/\bINTC\b|intel/i, "INTC"],
    [/\bRMBS\b|rambus/i, "RMBS"],
    [/\bMETA\b|meta platforms|facebook/i, "META"],
    [/\bANET\b|arista networks/i, "ANET"],
    [/\bAPH\b|amphenol/i, "APH"],
    [/\bPDD\b|pinduoduo|temu/i, "PDD"],
    [/\bTME\b|tencent music/i, "TME"],
    [/microsoft|\bMSFT\b/i, "MSFU/MSFT"],
    [/semiconductor|chip|gpu/i, "半导体"],
    [/artificial intelligence|\bAI\b|data center/i, "AI算力"],
    [/federal reserve|treasury yield|inflation|jobs report/i, "美股宏观"],
  ];
  mappings.forEach(([pattern, tag]) => { if (pattern.test(title)) tags.add(tag); });
  return [...tags];
}

async function loadUsNews(): Promise<{ news: NewsItem[]; status: SourceStatus; warnings: string[] }> {
  const queries: { category: NewsItem["category"]; query: string }[] = [
    { category: "美股市场", query: '("S&P 500" OR Nasdaq OR "US stocks" OR "Wall Street")' },
    { category: "海外宏观", query: '(Federal Reserve OR "US Treasury yields" OR "US inflation" OR "jobs report" OR tariffs)' },
    { category: "美股持仓", query: '(AMD OR Intel OR Rambus OR "Meta Platforms" OR "Arista Networks" OR Amphenol) (earnings OR guidance OR AI OR chip OR "data center")' },
    { category: "美股持仓", query: '(PDD OR Pinduoduo OR Temu OR "Tencent Music" OR TME) (earnings OR China OR ADR OR regulation)' },
    { category: "美股持仓", query: '(Microsoft OR MSFT) (earnings OR AI OR cloud OR guidance)' },
  ];
  const results = await Promise.allSettled(queries.map(async ({ category, query }) => {
    const url = new URL(GDELT_ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "ArtList");
    url.searchParams.set("maxrecords", "15");
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "HybridRel");
    url.searchParams.set("timespan", "24h");
    const payload = await fetchJson<GdeltResponse>(url.toString());
    return (payload.articles ?? []).map((article, index) => ({
      id: `us-${category}-${article.url ?? article.title ?? index}`,
      title: article.title?.trim() || "未命名新闻",
      url: article.url || "",
      domain: article.domain || "未知来源",
      publishedAt: article.seendate || "",
      category,
      impact: classifyImpact(article.title || ""),
      relevance: relevance(article.title || ""),
      source: "GDELT DOC 2.0",
    } satisfies NewsItem));
  }));

  const warnings: string[] = [];
  const newsMap = new Map<string, NewsItem>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") result.value.forEach((item) => { if (item.url) newsMap.set(item.url, item); });
    else warnings.push(`${queries[index].category}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
  });
  const news = [...newsMap.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 50);
  return {
    news,
    warnings,
    status: {
      id: "gdelt-us",
      name: "GDELT美股新闻",
      status: news.length ? (warnings.length ? "partial" : "online") : "error",
      updatedAt: new Date().toISOString(),
      message: news.length ? `过去24小时获取${news.length}条美股、宏观及持仓相关新闻` : "未获取到可用美股新闻",
    },
  };
}

export async function getUsMarketIntelligence(): Promise<UsMarketIntelligence> {
  const [fred, news] = await Promise.all([loadFredUsMacro(), loadUsNews()]);
  return {
    generatedAt: new Date().toISOString(),
    macro: fred.macro,
    news: news.news,
    sourceStatus: [fred.status, news.status],
    warnings: [...fred.warnings, ...news.warnings],
  };
}
