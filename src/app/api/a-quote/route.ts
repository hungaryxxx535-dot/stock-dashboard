import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Quote = { symbol: string; name: string; price: number | null };

/**
 * Proxies a symbol list to the local AKShare service (Tencent/EastMoney
 * fallback inside the Python service). Used by the screenshot import page to
 * disambiguate name-only CN holdings against the screenshot price.
 */
export async function GET(request: Request) {
  const symbols = (new URL(request.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => /^\d{6}$/.test(symbol))
    .slice(0, 20);
  if (!symbols.length) return NextResponse.json({ quotes: [] });

  const baseUrl = process.env.AKSHARE_API_URL;
  if (!baseUrl) return NextResponse.json({ quotes: [] });

  const token = process.env.AKSHARE_SERVICE_TOKEN;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/a/spot?symbols=${encodeURIComponent(symbols.join(","))}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
      headers: token ? { "x-service-token": token } : undefined,
    });
    if (!response.ok) return NextResponse.json({ quotes: [] });
    const payload = (await response.json()) as { quotes?: Quote[] };
    return NextResponse.json({
      quotes: (payload.quotes ?? [])
        .filter((quote) => typeof quote.price === "number" && quote.price !== null)
        .map((quote) => ({ symbol: quote.symbol, name: quote.name, price: quote.price })),
    });
  } catch {
    return NextResponse.json({ quotes: [] });
  }
}
