import type { ResearchNewsItem, ResearchProfile, ResearchProfileResponse } from "./research-profile";

type Market = "CN" | "HK" | "US";

const headers = { Accept: "application/json,text/xml,*/*", "User-Agent": "Mozilla/5.0 stock-dashboard/1.0" };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const decodeXml = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const tag = (block: string, name: string) => decodeXml(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1]?.trim() ?? "");

type EastmoneySurvey = { jbzl?: Array<Record<string, unknown>> };
type NasdaqField = { value?: unknown } | null;
type NasdaqProfile = { data?: Record<string, NasdaqField> | null };

export function parseEastmoneyProfile(payload: EastmoneySurvey, symbol: string): ResearchProfile | null {
  const row = payload.jbzl?.[0];
  if (!row) return null;
  const exchange = /^[569]/.test(symbol) ? "SH" : "SZ";
  return {
    organizationName: text(row.ORG_NAME) || text(row.SECURITY_NAME_ABBR),
    sector: text(row.INDUSTRYCSRC1),
    industry: text(row.EM2016) || text(row.INDUSTRYCSRC1),
    description: text(row.ORG_PROFILE),
    mainBusiness: text(row.MAIN_BUSINESS),
    listingMarket: text(row.TRADE_MARKET) || text(row.SECURITY_TYPE),
    listingDate: text(row.LISTING_DATE),
    source: "东方财富公司资料",
    sourceUrl: `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/Index?type=web&code=${exchange}${symbol}`,
  };
}

export function parseNasdaqProfile(payload: NasdaqProfile, symbol: string): ResearchProfile | null {
  const data = payload.data;
  const value = (key: string) => text(data?.[key]?.value);
  if (!data || !value("CompanyName")) return null;
  return {
    organizationName: value("CompanyName"),
    sector: value("Sector"),
    industry: value("Industry"),
    description: value("CompanyDescription"),
    mainBusiness: value("CompanyDescription"),
    listingMarket: value("Region"),
    listingDate: "",
    source: "Nasdaq Company Profile",
    sourceUrl: `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/company-profile`,
  };
}

export function parseGoogleNewsRss(xml: string, limit = 8): ResearchNewsItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, limit).flatMap((block) => {
    const title = tag(block, "title");
    const url = tag(block, "link");
    if (!title || !url.startsWith("http")) return [];
    const published = tag(block, "pubDate");
    const date = published ? new Date(published) : null;
    return [{ title, url, publisher: tag(block, "source") || "Google News 聚合来源", publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : "" }];
  });
}

async function loadProfile(market: Market, symbol: string): Promise<ResearchProfile | null> {
  if (market === "CN") {
    const exchange = /^[569]/.test(symbol) ? "SH" : "SZ";
    const response = await fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${exchange}${symbol}`, { cache: "no-store", signal: AbortSignal.timeout(7000), headers });
    if (!response.ok) throw new Error(`东方财富公司资料 HTTP ${response.status}`);
    return parseEastmoneyProfile(await response.json() as EastmoneySurvey, symbol);
  }
  if (market === "US") {
    const response = await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/company-profile`, { cache: "no-store", signal: AbortSignal.timeout(7000), headers });
    if (!response.ok) throw new Error(`Nasdaq 公司资料 HTTP ${response.status}`);
    return parseNasdaqProfile(await response.json() as NasdaqProfile, symbol);
  }
  return null;
}

async function loadNews(market: Market, symbol: string, name: string): Promise<ResearchNewsItem[]> {
  const english = market === "US";
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `${name || symbol} ${symbol} ${english ? "stock" : "股票"} when:7d`);
  url.searchParams.set("hl", english ? "en-US" : "zh-CN");
  url.searchParams.set("gl", english ? "US" : "CN");
  url.searchParams.set("ceid", english ? "US:en" : "CN:zh-Hans");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000), headers });
  if (!response.ok) throw new Error(`Google News RSS HTTP ${response.status}`);
  return parseGoogleNewsRss(await response.text());
}

export async function loadResearchProfile(market: Market, symbol: string, name: string): Promise<ResearchProfileResponse> {
  const fetchedAt = new Date().toISOString();
  const [profileResult, newsResult] = await Promise.allSettled([loadProfile(market, symbol), loadNews(market, symbol, name)]);
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  const warnings: string[] = [];
  if (!profile) warnings.push(profileResult.status === "rejected" ? String(profileResult.reason instanceof Error ? profileResult.reason.message : profileResult.reason) : "该证券暂无可用公司资料");
  if (!news.length) warnings.push(newsResult.status === "rejected" ? String(newsResult.reason instanceof Error ? newsResult.reason.message : newsResult.reason) : "过去7天暂无匹配资讯");
  return { status: profile && news.length ? "updated" : profile || news.length ? "partial" : "failed", fetchedAt, profile, news, warnings };
}
