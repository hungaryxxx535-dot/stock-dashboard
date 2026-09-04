import type { PortfolioQuoteResponse, PublicPortfolioQuote } from "./portfolio-quotes";

type Target = { market: "CN" | "HK" | "US"; symbol: string; providerCode: string };
const endpoint = "https://qt.gtimg.cn/q=";

function toTarget(raw: string): Target | null {
  const [market, rawSymbol] = raw.split(":");
  const symbol = rawSymbol?.trim().toUpperCase() ?? "";
  if (market === "CN" && /^\d{6}$/.test(symbol)) {
    return { market, symbol, providerCode: `${/^[569]/.test(symbol) ? "sh" : "sz"}${symbol}` };
  }
  if (market === "HK" && /^\d{5}$/.test(symbol)) return { market, symbol, providerCode: `hk${symbol}` };
  if (market === "US" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return { market, symbol, providerCode: `us${symbol}` };
  return null;
}

const finite = (value: string | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function marketTime(value: string | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length < 14) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}+08:00`;
}

export function parseTencentPortfolioQuotes(text: string, targets: Target[]): PublicPortfolioQuote[] {
  const targetByCode = new Map(targets.map((item) => [item.providerCode.toLowerCase(), item]));
  const quotes: PublicPortfolioQuote[] = [];
  for (const match of text.matchAll(/v_(\w+)="([^"]*)"/g)) {
    const target = targetByCode.get(match[1].toLowerCase());
    if (!target) continue;
    const fields = match[2].split("~");
    const price = finite(fields[3]);
    if (price === null || price <= 0) continue;
    const previousClose = finite(fields[4]);
    quotes.push({
      market: target.market,
      symbol: target.symbol,
      price,
      previousClose: previousClose && previousClose > 0 ? previousClose : null,
      marketTime: marketTime(fields[30]),
      source: "腾讯公开行情（延迟）",
    });
  }
  return quotes;
}

export async function fetchPortfolioQuotes(rawTargets: string[]): Promise<PortfolioQuoteResponse> {
  const fetchedAt = new Date().toISOString();
  const targets = rawTargets.map(toTarget).filter((item): item is Target => item !== null).slice(0, 40);
  if (!targets.length) return { status: "failed", fetchedAt, source: "腾讯公开行情", quotes: [], missing: [], message: "没有可查询的证券代码" };
  try {
    const response = await fetch(`${endpoint}${targets.map((item) => item.providerCode).join(",")}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
      headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0 stock-dashboard/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = new TextDecoder("gbk").decode(Buffer.from(await response.arrayBuffer()));
    const quotes = parseTencentPortfolioQuotes(text, targets);
    const returned = new Set(quotes.map((item) => `${item.market}:${item.symbol}`));
    const missing = targets.map((item) => `${item.market}:${item.symbol}`).filter((item) => !returned.has(item));
    return {
      status: quotes.length === targets.length ? "updated" : quotes.length ? "partial" : "failed",
      fetchedAt,
      source: "腾讯公开行情",
      quotes,
      missing,
      message: `已更新 ${quotes.length}/${targets.length} 项持仓行情${missing.length ? `；${missing.length} 项暂未返回` : ""}`,
    };
  } catch (error) {
    return { status: "failed", fetchedAt, source: "腾讯公开行情", quotes: [], missing: targets.map((item) => `${item.market}:${item.symbol}`), message: error instanceof Error ? `行情读取失败：${error.message}` : "行情读取失败" };
  }
}
