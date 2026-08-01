import type { MacroIndicator, MarketIndexSnapshot, NewsItem, SourceStatus } from "./types";

const EASTMONEY_INDEX_ENDPOINT = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const TENCENT_QUOTE_ENDPOINT = "https://qt.gtimg.cn/q=";
const GOOGLE_NEWS_RSS_ENDPOINT = "https://news.google.com/rss/search";
const SINA_HQ_ENDPOINT = "https://hq.sinajs.cn/list=";
const SINA_ROLL_NEWS_ENDPOINT = "https://feed.mix.sina.com.cn/api/roll/get";

const SINA_HEADERS = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0 stock-dashboard/1.0",
  Referer: "https://finance.sina.com.cn/",
};

function nowIso() {
  return new Date().toISOString();
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 stock-dashboard/1.0",
      Referer: "https://quote.eastmoney.com/",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 stock-dashboard/1.0",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchSinaText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
    headers: SINA_HEADERS,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return new TextDecoder("gbk").decode(bytes);
}

type EastmoneyRow = {
  f12?: string;
  f14?: string;
  f2?: number | string;
  f3?: number | string;
  f124?: number | string;
};

type EastmoneyResponse = {
  data?: {
    diff?: EastmoneyRow[];
  };
};

const indexNameMap: Record<string, string> = {
  "000001": "上证指数",
  "399001": "深证成指",
  "000688": "科创50",
  "399006": "创业板指",
  "399300": "沪深300",
};

const tencentIndexTargets = [
  "sh000001",
  "sz399001",
  "sh000688",
  "sz399006",
  "sz399300",
  "hkHSI",
  "hkHSTECH",
  "usINX",
  "usIXIC",
  "usDJI",
] as const;

/**
 * Tencent's public quote endpoint (qt.gtimg.cn) is reachable in more network
 * environments than EastMoney's push2 API and responds in well under a second.
 * It returns GBK-encoded `v_code="..."` lines; field 3 is the latest price and
 * field 4 the previous close.
 */
export async function loadTencentIndicesFallback(): Promise<{
  indices: MarketIndexSnapshot[];
  status: SourceStatus;
  warnings: string[];
}> {
  try {
    const response = await fetch(`${TENCENT_QUOTE_ENDPOINT}${tencentIndexTargets.join(",")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0 stock-dashboard/1.0" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = new TextDecoder("gbk").decode(bytes);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const indices: MarketIndexSnapshot[] = [];

    for (const match of text.matchAll(/v_(\w+)="([^"]*)"/g)) {
      const fields = match[2].split("~");
      const code = fields[2] ?? "";
      const close = finite(fields[3]);
      const previousClose = finite(fields[4]);
      if (!code || close === null || previousClose === null || previousClose === 0) continue;
      const tradeDate = (fields[30] ?? "").slice(0, 8) || today;
      indices.push({
        code,
        name: indexNameMap[code] ?? fields[1] ?? code,
        tradeDate,
        close,
        pctChange: ((close - previousClose) / previousClose) * 100,
        source: "腾讯公开行情",
      });
    }

    return {
      indices,
      warnings: indices.length ? [] : ["腾讯公开行情未返回有效A股指数数据。"],
      status: {
        id: "tencent-index",
        name: "腾讯公开行情",
        status: indices.length >= 3 ? "online" : indices.length ? "partial" : "error",
        updatedAt: nowIso(),
        message: indices.length ? `免密钥读取${indices.length}项A股主要指数` : "未获得有效指数数据",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      indices: [],
      warnings: [`腾讯A股指数读取失败：${message}`],
      status: {
        id: "tencent-index",
        name: "腾讯公开行情",
        status: "error",
        updatedAt: nowIso(),
        message,
      },
    };
  }
}

export async function loadEastmoneyIndicesFallback(): Promise<{
  indices: MarketIndexSnapshot[];
  status: SourceStatus;
  warnings: string[];
}> {
  try {
    const url = new URL(EASTMONEY_INDEX_ENDPOINT);
    url.searchParams.set("fltt", "2");
    url.searchParams.set("invt", "2");
    url.searchParams.set("fields", "f12,f14,f2,f3,f124");
    url.searchParams.set("secids", "1.000001,0.399001,1.000688,0.399006");
    const payload = await fetchJson<EastmoneyResponse>(url.toString());
    const rows = payload.data?.diff ?? [];
    const indices = rows
      .map((row) => {
        const code = row.f12 ?? "";
        const close = finite(row.f2);
        const pctChange = finite(row.f3);
        if (!code || close === null || pctChange === null) return null;
        const unixTime = finite(row.f124);
        return {
          code,
          name: indexNameMap[code] ?? row.f14 ?? code,
          tradeDate: unixTime ? new Date(unixTime * 1000).toISOString().slice(0, 10).replace(/-/g, "") : new Date().toISOString().slice(0, 10).replace(/-/g, ""),
          close,
          pctChange,
          source: "东方财富公开行情",
        } satisfies MarketIndexSnapshot;
      })
      .filter((item): item is MarketIndexSnapshot => item !== null);

    return {
      indices,
      warnings: indices.length ? [] : ["东方财富公开行情未返回有效A股指数数据。"],
      status: {
        id: "eastmoney-index",
        name: "东方财富公开行情",
        status: indices.length >= 3 ? "online" : indices.length ? "partial" : "error",
        updatedAt: nowIso(),
        message: indices.length ? `免密钥读取${indices.length}项A股主要指数` : "未获得有效指数数据",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      indices: [],
      warnings: [`东方财富A股指数读取失败：${message}`],
      status: {
        id: "eastmoney-index",
        name: "东方财富公开行情",
        status: "error",
        updatedAt: nowIso(),
        message,
      },
    };
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tagValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function linkValue(block: string): string {
  const raw = tagValue(block, "link");
  return raw.replace(/&amp;/g, "&");
}

function classifyImpact(title: string): NewsItem["impact"] {
  const text = title.toLowerCase();
  const positive = ["上涨", "大涨", "增长", "超预期", "上调", "降息", "回购", "支持", "突破", "rally", "surge", "beat", "upgrade", "stimulus", "rate cut"];
  const negative = ["下跌", "大跌", "不及预期", "下调", "处罚", "调查", "限制", "制裁", "关税", "亏损", "selloff", "drop", "miss", "downgrade", "restriction", "sanction", "tariff"];
  if (positive.some((word) => text.includes(word))) return "利多";
  if (negative.some((word) => text.includes(word))) return "利空";
  return "待判断";
}

function relevance(title: string, category: NewsItem["category"]): string[] {
  const tags = new Set<string>();
  const mappings: [RegExp, string][] = [
    [/澜起科技|DDR|CXL|memory interface/i, "澜起科技"],
    [/中际旭创|光模块|光通信|optical module/i, "中际旭创/通信ETF"],
    [/胜宏科技|PCB|印制电路板/i, "胜宏科技"],
    [/中科曙光|服务器|算力|data center/i, "中科曙光"],
    [/招商银行|银行|bank/i, "招商银行"],
    [/半导体|芯片|semiconductor|chip/i, "半导体ETF组合"],
    [/黄金|gold/i, "黄金9999"],
    [/科创板|创业板|上证指数|A股/i, "A股整体"],
  ];
  mappings.forEach(([pattern, label]) => {
    if (pattern.test(title)) tags.add(label);
  });
  if (!tags.size && category === "中国宏观") tags.add("A股整体");
  if (!tags.size && category === "海外宏观") tags.add("成长股估值/全球风险偏好");
  return [...tags];
}

const rssQueries: { category: NewsItem["category"]; query: string }[] = [
  { category: "中国宏观", query: "中国 央行 财政 PMI CPI 经济 when:1d" },
  { category: "A股市场", query: "A股 上证指数 科创板 创业板 when:1d" },
  { category: "半导体算力", query: "半导体 算力 AI芯片 光模块 数据中心 when:1d" },
  { category: "海外宏观", query: "美联储 美债收益率 VIX 关税 全球市场 when:1d" },
  { category: "持仓相关", query: "澜起科技 中际旭创 胜宏科技 中科曙光 招商银行 when:1d" },
];

export async function loadGoogleNewsFallback(): Promise<{
  news: NewsItem[];
  status: SourceStatus;
  warnings: string[];
}> {
  const results = await Promise.allSettled(
    rssQueries.map(async ({ category, query }) => {
      const url = new URL(GOOGLE_NEWS_RSS_ENDPOINT);
      url.searchParams.set("q", query);
      url.searchParams.set("hl", "zh-CN");
      url.searchParams.set("gl", "CN");
      url.searchParams.set("ceid", "CN:zh-Hans");
      const xml = await fetchText(url.toString());
      const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
      return blocks.slice(0, 12).map((block, index) => {
        const title = tagValue(block, "title") || "未命名新闻";
        const link = linkValue(block);
        const source = tagValue(block, "source") || "Google News聚合来源";
        const published = tagValue(block, "pubDate");
        return {
          id: `google-${category}-${link || title}-${index}`,
          title,
          url: link,
          domain: source,
          publishedAt: published ? new Date(published).toISOString() : "",
          category,
          impact: classifyImpact(title),
          relevance: relevance(title, category),
          source: "Google News RSS",
        } satisfies NewsItem;
      });
    }),
  );

  const warnings: string[] = [];
  const newsMap = new Map<string, NewsItem>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      result.value.forEach((item) => {
        const key = item.url || item.title;
        if (key) newsMap.set(key, item);
      });
    } else {
      warnings.push(`${rssQueries[index].category} Google News读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
    }
  });
  const news = [...newsMap.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 40);

  return {
    news,
    warnings,
    status: {
      id: "google-news-rss",
      name: "Google News RSS",
      status: news.length ? (warnings.length ? "partial" : "online") : "error",
      updatedAt: nowIso(),
      message: news.length ? `免密钥读取过去24小时${news.length}条新闻` : "未获得有效新闻",
    },
  };
}

const SINA_COMMODITY_TARGETS = [
  { id: "gold", name: "黄金", unit: "美元/盎司", code: "hf_GC" },
  { id: "oil", name: "原油", unit: "美元/桶", code: "hf_CL" },
  { id: "usdcny", name: "人民币汇率", unit: "CNY/USD", code: "fx_susdcny" },
] as const;

function macroDirection(value: number | null, previous: number | null): MacroIndicator["direction"] {
  if (value === null || previous === null) return "unknown";
  if (Math.abs(value - previous) < 1e-9) return "flat";
  return value > previous ? "up" : "down";
}

/**
 * Sina's public quote endpoint (hq.sinajs.cn) provides free access to NY gold,
 * NY crude oil and the onshore USD/CNY rate. It requires a finance.sina.com.cn
 * Referer and returns GBK-encoded `var hq_str_<code>="..."` lines.
 */
export async function loadSinaCommodityFallback(): Promise<{
  macro: MacroIndicator[];
  status: SourceStatus;
  warnings: string[];
}> {
  try {
    const codes = SINA_COMMODITY_TARGETS.map((target) => target.code).join(",");
    const text = await fetchSinaText(`${SINA_HQ_ENDPOINT}${codes}`);
    const rows = new Map<string, string[]>();
    for (const match of text.matchAll(/var hq_str_(\w+)="([^"]*)"/g)) {
      rows.set(match[1], match[2].split(","));
    }

    const macro: MacroIndicator[] = [];
    for (const target of SINA_COMMODITY_TARGETS) {
      const fields = rows.get(target.code);
      if (!fields || fields.length < 10) continue;
      const value = target.code === "fx_susdcny" ? numberValue(fields[3]) : numberValue(fields[0]);
      const previous = target.code === "fx_susdcny" ? numberValue(fields[1]) : numberValue(fields[7]);
      const period = fields[13] || fields[17] || "";
      const displayName = fields[14] || fields[9] || target.name;
      let interpretation = "公开行情源，仅用于观察";
      if (target.id === "gold") interpretation = "纽约黄金价格用于衡量避险需求与通胀预期";
      if (target.id === "oil") interpretation = "原油价格反映全球需求与通胀预期";
      if (target.id === "usdcny") interpretation = "在岸人民币汇率影响海外资产的人民币折算";
      macro.push({
        id: target.id,
        name: target.name,
        value,
        previous,
        unit: target.unit,
        period,
        direction: macroDirection(value, previous),
        interpretation,
        source: `新浪财经公开行情（${displayName}）`,
      });
    }

    return {
      macro,
      warnings: macro.length ? [] : ["新浪财经公开行情未返回有效商品或汇率数据。"],
      status: {
        id: "sina-commodity",
        name: "新浪财经商品与汇率",
        status: macro.length ? "online" : "error",
        updatedAt: nowIso(),
        message: macro.length ? `免密钥读取${macro.length}项商品与汇率数据` : "未获得有效数据",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      macro: [],
      warnings: [`新浪商品与汇率读取失败：${message}`],
      status: {
        id: "sina-commodity",
        name: "新浪财经商品与汇率",
        status: "error",
        updatedAt: nowIso(),
        message,
      },
    };
  }
}

type SinaRollItem = {
  title?: string;
  url?: string;
  intro?: string;
  media_name?: string;
  ctime?: string;
};

const sinaCategoryRules: Array<[NewsItem["category"], RegExp]> = [
  ["持仓相关", /澜起科技|中际旭创|胜宏科技|中科曙光|招商银行|通信ETF|科创50|赛力斯|黄金9999|半导体ETF/],
  ["中国宏观", /央行|人民银行|货币政策|财政部|国债|LPR|降准|PMI|CPI|PPI|中国经济|GDP/],
  ["半导体算力", /半导体|芯片|算力|人工智能|AI|光模块|数据中心|英伟达|OpenAI|服务器/],
  ["A股市场", /A股|上证|深证|创业板|科创板|沪深|涨停|北向|证监会|股市|券商/],
  ["海外宏观", /美联储|美债|美元|美股|加息|降息|关税|油价|黄金|全球市场|欧股|日股|OpenAI|英伟达/],
];

function sinaCategory(title: string): NewsItem["category"] {
  const text = title.toLowerCase();
  const matched = sinaCategoryRules.find(([, pattern]) => pattern.test(text));
  return matched ? matched[0] : (/[\u4e00-\u9fff]/.test(title) ? "A股市场" : "海外宏观");
}

export async function loadSinaNewsFallback(): Promise<{
  news: NewsItem[];
  status: SourceStatus;
  warnings: string[];
}> {
  const lids = ["2516", "2515", "2509", "2517"];
  const results = await Promise.allSettled(
    lids.map(async (lid) => {
      const url = new URL(SINA_ROLL_NEWS_ENDPOINT);
      url.searchParams.set("pageid", "153");
      url.searchParams.set("lid", lid);
      url.searchParams.set("k", "");
      url.searchParams.set("num", "15");
      url.searchParams.set("page", "1");
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
        headers: SINA_HEADERS,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = (await response.json()) as { result?: { data?: SinaRollItem[] } };
      return payload.result?.data ?? [];
    }),
  );

  const warnings: string[] = [];
  const newsMap = new Map<string, NewsItem>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      result.value.forEach((item) => {
        const title = item.title?.trim() || item.intro?.trim() || "";
        const url = item.url || "";
        if (!title || !url) return;
        const category = sinaCategory(title);
        newsMap.set(url, {
          id: `sina-${url}`,
          title,
          url,
          domain: item.media_name || "新浪财经",
          publishedAt: item.ctime ? new Date(Number(item.ctime) * 1000).toISOString() : "",
          category,
          impact: classifyImpact(title),
          relevance: relevance(title, category),
          source: "新浪财经",
        });
      });
    } else {
      warnings.push(`新浪财经频道 ${lids[index]} 读取失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
    }
  });

  const news = [...newsMap.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 40);

  return {
    news,
    warnings,
    status: {
      id: "sina-news",
      name: "新浪财经滚动新闻",
      status: news.length ? (warnings.length ? "partial" : "online") : "error",
      updatedAt: nowIso(),
      message: news.length ? `免密钥读取${news.length}条财经新闻` : "未获得有效新闻",
    },
  };
}
