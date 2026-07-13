import type {
  MacroIndicator,
  MarketIndexSnapshot,
  MarketIntelligencePayload,
  MarketRegime,
  NewsItem,
  SourceStatus,
} from "./types";

const TUSHARE_ENDPOINT = "https://api.tushare.pro";
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const FRED_ENDPOINT = "https://api.stlouisfed.org/fred/series/observations";

const nowIso = () => new Date().toISOString();
const compactDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(value: number | null, previous: number | null): MacroIndicator["direction"] {
  if (value === null || previous === null) return "unknown";
  if (Math.abs(value - previous) < 1e-9) return "flat";
  return value > previous ? "up" : "down";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

type TushareResponse = {
  code: number;
  msg?: string;
  data?: { fields: string[]; items: unknown[][] };
};

async function tushareRequest(apiName: string, params: Record<string, unknown>, fields = "") {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new Error("TUSHARE_TOKEN未配置");
  const payload = await fetchJson<TushareResponse>(TUSHARE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: apiName, token, params, fields }),
  });
  if (payload.code !== 0 || !payload.data) throw new Error(payload.msg || `${apiName}接口返回失败`);
  return payload.data.items.map((item) => Object.fromEntries(payload.data!.fields.map((field, index) => [field, item[index]])));
}

function latestTwo(rows: Record<string, unknown>[], dateKeys: string[]) {
  const dateKey = dateKeys.find((key) => rows.some((row) => row[key] !== undefined));
  const sorted = [...rows].sort((a, b) => String(b[dateKey ?? ""] ?? "").localeCompare(String(a[dateKey ?? ""] ?? "")));
  return [sorted[0], sorted[1]] as const;
}

function firstNumber(row: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!row) return null;
  for (const key of keys) {
    const value = numberValue(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstString(row: Record<string, unknown> | undefined, keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return String(row[key]);
  }
  return "";
}

async function loadTushare(): Promise<{
  indices: MarketIndexSnapshot[];
  macro: MacroIndicator[];
  status: SourceStatus;
  warnings: string[];
}> {
  if (!process.env.TUSHARE_TOKEN) {
    return {
      indices: [],
      macro: [],
      warnings: ["Tushare尚未配置，A股指数、北向资金和中国宏观数据暂未联网。"],
      status: { id: "tushare", name: "Tushare Pro", status: "not_configured", updatedAt: nowIso(), message: "需要在Vercel配置TUSHARE_TOKEN" },
    };
  }

  const warnings: string[] = [];
  const indices: MarketIndexSnapshot[] = [];
  const macro: MacroIndicator[] = [];
  const startDate = compactDate(daysAgo(18));
  const endDate = compactDate(new Date());
  const indexTargets = [
    ["000001.SH", "上证指数"],
    ["399001.SZ", "深证成指"],
    ["000688.SH", "科创50"],
    ["399006.SZ", "创业板指"],
  ] as const;

  const indexResults = await Promise.allSettled(
    indexTargets.map(async ([code, name]) => {
      const rows = await tushareRequest("index_daily", { ts_code: code, start_date: startDate, end_date: endDate }, "ts_code,trade_date,close,pct_chg");
      const [latest] = latestTwo(rows, ["trade_date"]);
      if (!latest) throw new Error(`${name}无数据`);
      return {
        code,
        name,
        tradeDate: firstString(latest, ["trade_date"]),
        close: firstNumber(latest, ["close"]) ?? 0,
        pctChange: firstNumber(latest, ["pct_chg"]) ?? 0,
        source: "Tushare Pro",
      } satisfies MarketIndexSnapshot;
    }),
  );
  indexResults.forEach((result, index) => {
    if (result.status === "fulfilled") indices.push(result.value);
    else warnings.push(`${indexTargets[index][1]}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
  });

  const macroJobs = await Promise.allSettled([
    tushareRequest("moneyflow_hsgt", { start_date: startDate, end_date: endDate }, "trade_date,north_money"),
    tushareRequest("cn_pmi", {}, "month,pmi010000"),
    tushareRequest("cn_cpi", {}, "month,nt_yoy,nt_mom"),
    tushareRequest("cn_ppi", {}, "month,ppi_yoy"),
    tushareRequest("shibor", { start_date: startDate, end_date: endDate }, "date,on,1w,1m"),
  ]);

  const [northResult, pmiResult, cpiResult, ppiResult, shiborResult] = macroJobs;
  if (northResult.status === "fulfilled") {
    const [latest, previous] = latestTwo(northResult.value, ["trade_date"]);
    const value = firstNumber(latest, ["north_money"]);
    const previousValue = firstNumber(previous, ["north_money"]);
    macro.push({ id: "north_money", name: "北向资金净流入", value, previous: previousValue, unit: "百万元", period: firstString(latest, ["trade_date"]), direction: direction(value, previousValue), interpretation: value === null ? "数据缺失" : value > 0 ? "外资当日净流入，风险偏好边际偏正" : "外资当日净流出，需结合连续性判断", source: "Tushare Pro" });
  } else warnings.push(`北向资金读取失败：${northResult.reason instanceof Error ? northResult.reason.message : "未知错误"}`);

  if (pmiResult.status === "fulfilled") {
    const [latest, previous] = latestTwo(pmiResult.value, ["month"]);
    const value = firstNumber(latest, ["pmi010000", "pmi"]);
    const previousValue = firstNumber(previous, ["pmi010000", "pmi"]);
    macro.push({ id: "cn_pmi", name: "中国制造业PMI", value, previous: previousValue, unit: "%", period: firstString(latest, ["month"]), direction: direction(value, previousValue), interpretation: value === null ? "数据缺失" : value >= 50 ? "制造业处于扩张区间" : "制造业仍处于收缩区间", source: "Tushare Pro" });
  } else warnings.push(`PMI读取失败：${pmiResult.reason instanceof Error ? pmiResult.reason.message : "未知错误"}`);

  if (cpiResult.status === "fulfilled") {
    const [latest, previous] = latestTwo(cpiResult.value, ["month"]);
    const value = firstNumber(latest, ["nt_yoy", "cpi_yoy"]);
    const previousValue = firstNumber(previous, ["nt_yoy", "cpi_yoy"]);
    macro.push({ id: "cn_cpi", name: "中国CPI同比", value, previous: previousValue, unit: "%", period: firstString(latest, ["month"]), direction: direction(value, previousValue), interpretation: value === null ? "数据缺失" : value < 1 ? "通胀偏低，内需修复仍需观察" : value > 3 ? "通胀偏高，政策宽松空间可能受约束" : "通胀处于相对温和区间", source: "Tushare Pro" });
  } else warnings.push(`CPI读取失败：${cpiResult.reason instanceof Error ? cpiResult.reason.message : "未知错误"}`);

  if (ppiResult.status === "fulfilled") {
    const [latest, previous] = latestTwo(ppiResult.value, ["month"]);
    const value = firstNumber(latest, ["ppi_yoy", "ppi010000"]);
    const previousValue = firstNumber(previous, ["ppi_yoy", "ppi010000"]);
    macro.push({ id: "cn_ppi", name: "中国PPI同比", value, previous: previousValue, unit: "%", period: firstString(latest, ["month"]), direction: direction(value, previousValue), interpretation: value === null ? "数据缺失" : value >= 0 ? "工业品价格同比转正或维持正增长" : "工业品价格仍承压，关注企业盈利修复", source: "Tushare Pro" });
  } else warnings.push(`PPI读取失败：${ppiResult.reason instanceof Error ? ppiResult.reason.message : "未知错误"}`);

  if (shiborResult.status === "fulfilled") {
    const [latest, previous] = latestTwo(shiborResult.value, ["date"]);
    const value = firstNumber(latest, ["on"]);
    const previousValue = firstNumber(previous, ["on"]);
    macro.push({ id: "shibor_on", name: "隔夜Shibor", value, previous: previousValue, unit: "%", period: firstString(latest, ["date"]), direction: direction(value, previousValue), interpretation: value === null ? "数据缺失" : value < 2 ? "短端流动性相对宽松" : "短端资金价格偏高，关注流动性扰动", source: "Tushare Pro" });
  } else warnings.push(`Shibor读取失败：${shiborResult.reason instanceof Error ? shiborResult.reason.message : "未知错误"}`);

  return {
    indices,
    macro,
    warnings,
    status: { id: "tushare", name: "Tushare Pro", status: warnings.length ? "partial" : "online", updatedAt: nowIso(), message: warnings.length ? `已联网，但有${warnings.length}项接口未返回` : "A股指数、资金面与中国宏观接口正常" },
  };
}

type FredResponse = { observations?: { date: string; value: string }[] };

async function fredSeries(seriesId: string) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY未配置");
  const url = new URL(FRED_ENDPOINT);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "20");
  const payload = await fetchJson<FredResponse>(url.toString());
  const observations = (payload.observations ?? []).filter((item) => item.value !== "." && Number.isFinite(Number(item.value)));
  return observations.slice(0, 2);
}

async function loadFred(): Promise<{ macro: MacroIndicator[]; status: SourceStatus; warnings: string[] }> {
  if (!process.env.FRED_API_KEY) {
    return {
      macro: [],
      warnings: ["FRED尚未配置，美债收益率、VIX与美元环境暂未联网。"],
      status: { id: "fred", name: "FRED", status: "not_configured", updatedAt: nowIso(), message: "需要在Vercel配置FRED_API_KEY" },
    };
  }
  const targets = [
    ["DGS10", "美国10年期国债收益率", "%"],
    ["DGS2", "美国2年期国债收益率", "%"],
    ["VIXCLS", "VIX恐慌指数", "点"],
    ["DTWEXBGS", "美元广义指数", "点"],
  ] as const;
  const results = await Promise.allSettled(targets.map(([id]) => fredSeries(id)));
  const macro: MacroIndicator[] = [];
  const warnings: string[] = [];
  results.forEach((result, index) => {
    const [id, name, unit] = targets[index];
    if (result.status === "rejected") {
      warnings.push(`${name}读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
      return;
    }
    const [latest, previous] = result.value;
    const value = numberValue(latest?.value);
    const previousValue = numberValue(previous?.value);
    let interpretation = "用于判断海外流动性与风险偏好";
    if (id === "VIXCLS" && value !== null) interpretation = value < 20 ? "海外风险偏好相对稳定" : value >= 30 ? "海外避险情绪明显升温" : "海外波动处于偏高区间";
    if (id === "DGS10" && value !== null) interpretation = value >= 4.5 ? "长端美债收益率偏高，对成长估值形成压力" : "长端利率压力相对可控";
    macro.push({ id: id.toLowerCase(), name, value, previous: previousValue, unit, period: latest?.date ?? "", direction: direction(value, previousValue), interpretation, source: "FRED" });
  });

  const ten = macro.find((item) => item.id === "dgs10")?.value;
  const two = macro.find((item) => item.id === "dgs2")?.value;
  if (ten !== undefined && ten !== null && two !== undefined && two !== null) {
    const spread = ten - two;
    macro.push({ id: "us_2s10s", name: "美债2Y-10Y利差", value: spread, previous: null, unit: "百分点", period: macro.find((item) => item.id === "dgs10")?.period ?? "", direction: "unknown", interpretation: spread < 0 ? "收益率曲线倒挂，海外增长预期仍偏谨慎" : "收益率曲线为正，衰退定价压力相对减弱", source: "FRED" });
  }
  return {
    macro,
    warnings,
    status: { id: "fred", name: "FRED", status: warnings.length ? "partial" : "online", updatedAt: nowIso(), message: warnings.length ? `已联网，但有${warnings.length}项序列未返回` : "海外利率、波动率与美元数据正常" },
  };
}

type GdeltArticle = { url?: string; title?: string; seendate?: string; domain?: string; language?: string; sourcecountry?: string };
type GdeltResponse = { articles?: GdeltArticle[] };

const newsQueries: { category: NewsItem["category"]; query: string }[] = [
  { category: "中国宏观", query: '(China economy OR PBOC OR "China monetary policy" OR "China fiscal policy")' },
  { category: "A股市场", query: '("A shares" OR "China stock market" OR Shanghai Composite OR Shenzhen stocks)' },
  { category: "半导体算力", query: '(semiconductor OR "AI chips" OR "optical communication" OR "data center")' },
  { category: "海外宏观", query: '(Federal Reserve OR "US Treasury yields" OR US inflation OR tariffs)' },
  { category: "持仓相关", query: '(澜起科技 OR 中际旭创 OR 胜宏科技 OR 中科曙光 OR 招商银行)' },
];

function newsImpact(title: string): NewsItem["impact"] {
  const normalized = title.toLowerCase();
  const positive = ["surge", "rally", "beat", "record", "growth", "stimulus", "cut rates", "support", "突破", "增长", "上调", "降息", "支持"];
  const negative = ["fall", "drop", "warning", "sanction", "restriction", "tariff", "miss", "decline", "下跌", "制裁", "限制", "关税", "下调", "亏损"];
  if (positive.some((keyword) => normalized.includes(keyword))) return "利多";
  if (negative.some((keyword) => normalized.includes(keyword))) return "利空";
  return "待判断";
}

function newsRelevance(title: string, category: NewsItem["category"]): string[] {
  const tags = new Set<string>();
  const mappings: [RegExp, string][] = [
    [/澜起科技|memory interface|ddr|cxl/i, "澜起科技"],
    [/中际旭创|optical communication|optical module/i, "中际旭创/通信ETF"],
    [/胜宏科技|pcb|printed circuit/i, "胜宏科技"],
    [/中科曙光|server|data center|computing power/i, "中科曙光"],
    [/招商银行|banking|bank/i, "招商银行"],
    [/semiconductor|chip/i, "半导体ETF组合"],
    [/gold|黄金/i, "黄金9999"],
  ];
  mappings.forEach(([pattern, label]) => { if (pattern.test(title)) tags.add(label); });
  if (!tags.size && category === "中国宏观") tags.add("A股整体");
  if (!tags.size && category === "海外宏观") tags.add("美股科技/A股成长估值");
  return [...tags];
}

async function loadGdelt(): Promise<{ news: NewsItem[]; status: SourceStatus; warnings: string[] }> {
  const results = await Promise.allSettled(newsQueries.map(async ({ category, query }) => {
    const url = new URL(GDELT_ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "ArtList");
    url.searchParams.set("maxrecords", "15");
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
      impact: newsImpact(article.title || ""),
      relevance: newsRelevance(article.title || "", category),
      source: "GDELT DOC 2.0",
    } satisfies NewsItem));
  }));

  const warnings: string[] = [];
  const newsMap = new Map<string, NewsItem>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") result.value.forEach((item) => { if (item.url) newsMap.set(item.url, item); });
    else warnings.push(`${newsQueries[index].category}新闻读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
  });
  const news = [...newsMap.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 40);
  return {
    news,
    warnings,
    status: { id: "gdelt", name: "GDELT DOC 2.0", status: news.length ? (warnings.length ? "partial" : "online") : "error", updatedAt: nowIso(), message: news.length ? `已抓取过去24小时${news.length}条相关全球新闻` : "过去24小时未获得可用新闻" },
  };
}

function buildRegime(indices: MarketIndexSnapshot[], macro: MacroIndicator[], news: NewsItem[]): MarketRegime {
  const reasons: string[] = [];
  let score = 50;
  let evidence = 0;

  if (indices.length) {
    const average = indices.reduce((sum, item) => sum + item.pctChange, 0) / indices.length;
    score += Math.max(-15, Math.min(15, average * 5));
    evidence += 2;
    reasons.push(`主要A股指数平均涨跌${average >= 0 ? "+" : ""}${average.toFixed(2)}%`);
  }
  const north = macro.find((item) => item.id === "north_money")?.value;
  if (north !== undefined && north !== null) {
    score += north > 0 ? 7 : -7;
    evidence += 1;
    reasons.push(`北向资金${north > 0 ? "净流入" : "净流出"}${Math.abs(north).toFixed(0)}百万元`);
  }
  const pmi = macro.find((item) => item.id === "cn_pmi")?.value;
  if (pmi !== undefined && pmi !== null) {
    score += pmi >= 50 ? 6 : -6;
    evidence += 1;
    reasons.push(`制造业PMI为${pmi.toFixed(1)}，处于${pmi >= 50 ? "扩张" : "收缩"}区间`);
  }
  const vix = macro.find((item) => item.id === "vixcls")?.value;
  if (vix !== undefined && vix !== null) {
    score += vix < 20 ? 6 : vix >= 30 ? -10 : -3;
    evidence += 1;
    reasons.push(`VIX为${vix.toFixed(1)}，海外波动${vix < 20 ? "较低" : vix >= 30 ? "显著升高" : "偏高"}`);
  }
  const tenYear = macro.find((item) => item.id === "dgs10")?.value;
  if (tenYear !== undefined && tenYear !== null) {
    score += tenYear >= 4.5 ? -6 : 2;
    evidence += 1;
    reasons.push(`美国10年期国债收益率${tenYear.toFixed(2)}%`);
  }
  const negativeNews = news.filter((item) => item.impact === "利空").length;
  const positiveNews = news.filter((item) => item.impact === "利多").length;
  if (news.length) {
    score += Math.max(-6, Math.min(6, (positiveNews - negativeNews) * 0.8));
    evidence += 1;
    reasons.push(`过去24小时规则识别利多${positiveNews}条、利空${negativeNews}条，其余需人工判断`);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));
  if (evidence < 2) return { label: "数据不足", score: null, confidence: Math.round((evidence / 6) * 100), reasons: reasons.length ? reasons : ["外部数据源尚未完成配置"], actionBias: "暂不根据外部环境调整仓位，只保留持仓结构分析。" };
  const label: MarketRegime["label"] = score >= 62 ? "风险偏好改善" : score <= 42 ? "风险偏好收缩" : "震荡中性";
  const actionBias = label === "风险偏好改善" ? "可以寻找确认后的进攻机会，但不得忽视组合仓位与估值。" : label === "风险偏好收缩" ? "优先控制回撤、减少追涨，等待宏观和市场信号企稳。" : "保持中性仓位，优先做持仓优化而不是方向性重仓。";
  return { label, score, confidence: Math.min(100, 35 + evidence * 10), reasons, actionBias };
}

export async function getMarketIntelligence(): Promise<MarketIntelligencePayload> {
  const [tushare, fred, gdelt] = await Promise.all([loadTushare(), loadFred(), loadGdelt()]);
  const macro = [...tushare.macro, ...fred.macro];
  const warnings = [...tushare.warnings, ...fred.warnings, ...gdelt.warnings];
  return {
    generatedAt: nowIso(),
    regime: buildRegime(tushare.indices, macro, gdelt.news),
    indices: tushare.indices,
    macro,
    news: gdelt.news,
    sourceStatus: [tushare.status, fred.status, gdelt.status],
    warnings,
  };
}
