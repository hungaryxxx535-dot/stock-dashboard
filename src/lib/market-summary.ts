export type MarketSummary = { summary: string; notes: string[]; source: string };

/**
 * Best-effort snapshot of the market radar for embedding in reviews and
 * archives. Never throws; the caller gets an explicit "unavailable" message.
 */
export async function loadMarketSummary(): Promise<MarketSummary> {
  try {
    const response = await fetch("/api/market");
    const data = await response.json();
    const available = (data.cards ?? []).filter((card: { value: number | null }) => card.value !== null);
    const movers = available
      .filter((card: { changePct: number | null }) => card.changePct !== null)
      .sort((a: { changePct: number }, b: { changePct: number }) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5);
    const summary = movers.length
      ? `市场雷达捕获 ${available.length} 项数据，波动较大：${movers.map((card: { name: string; changePct: number }) => `${card.name} ${card.changePct > 0 ? "+" : ""}${card.changePct.toFixed(2)}%`).join("、")}`
      : "市场数据暂不可用，复盘中的市场环境仅为结构提示。";
    return { summary, notes: data.warnings?.slice(0, 5) ?? [], source: data.generatedAt ? `市场雷达 · ${new Date(data.generatedAt).toLocaleString("zh-CN")}` : "" };
  } catch {
    return { summary: "市场数据获取失败", notes: [], source: "" };
  }
}
