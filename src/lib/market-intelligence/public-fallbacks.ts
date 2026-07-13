import type { MarketIndexSnapshot, NewsItem, SourceStatus } from "./types";

const EASTMONEY_INDEX_ENDPOINT = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const GOOGLE_NEWS_RSS_ENDPOINT = "https://news.google.com/rss/search";

function nowIso() {
  return new Date().toISOString();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
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
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 stock-dashboard/1.0",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
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
};

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
