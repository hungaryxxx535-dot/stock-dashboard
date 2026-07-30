import { AppStateSchema, type AppState, type Holding, type Instrument } from "@/domain/model";

export const LEGACY_SCREENSHOT_KEY = "feige:a-share-screenshot:v1";
export const LEGACY_TRADE_PLAN_KEYS = ["fei-trade-plan-v2", "fei-trade-plan-v3"];
export const LEGACY_REVIEW_KEY = "feige:trade-reviews:v1";

type LegacySnapshot = {
  holdings?: Array<{
    code?: string;
    name?: string;
    quantity?: number;
    costPrice?: number;
    note?: string;
    type?: string;
  }>;
  importedAt?: string;
};

export function hasLegacyBrowserData(storage: Storage): boolean {
  return [LEGACY_SCREENSHOT_KEY, LEGACY_REVIEW_KEY, ...LEGACY_TRADE_PLAN_KEYS].some((key) => Boolean(storage.getItem(key)));
}

export function migrateLegacyBrowserData(state: AppState, storage: Storage): AppState {
  const raw = storage.getItem(LEGACY_SCREENSHOT_KEY);
  if (!raw) return state;

  const legacy = JSON.parse(raw) as LegacySnapshot;
  if (!Array.isArray(legacy.holdings) || legacy.holdings.length === 0) return state;

  const now = new Date().toISOString();
  const accountId = state.accounts.find((account) => account.market === "CN")?.id ?? state.accounts[0]?.id;
  if (!accountId) throw new Error("缺少可迁移账户");

  const instruments: Instrument[] = legacy.holdings.map((item, index) => ({
    id: `legacy-instrument-${index}-${item.code || "unknown"}`,
    symbol: item.code || `UNKNOWN-${index + 1}`,
    name: item.name || "待核对标的",
    market: "CN",
    currency: "CNY",
    assetType: "stock",
    sectors: [],
    styles: [],
    isLeveraged: false,
  }));

  const holdings: Holding[] = legacy.holdings.map((item, index) => ({
    id: crypto.randomUUID(),
    accountId,
    instrumentId: instruments[index].id,
    quantity: Number(item.quantity) || 0,
    brokerCost: Number(item.costPrice) || 0,
    economicCost: Number(item.costPrice) || 0,
    status: Number(item.quantity) > 0 ? "open" : "closed",
    thesis: item.note || "旧版数据迁移，等待人工复核",
    tags: item.type ? [item.type] : ["旧版迁移"],
    openedAt: legacy.importedAt || now,
    closedAt: Number(item.quantity) > 0 ? null : now,
    updatedAt: now,
  }));

  return AppStateSchema.parse({
    ...state,
    mode: "local",
    updatedAt: now,
    instruments: [...state.instruments.filter((instrument) => !instrument.id.startsWith("demo-")), ...instruments],
    holdings,
    dataVersions: [
      ...state.dataVersions,
      { id: crypto.randomUUID(), label: "旧版数据迁移", reason: "从旧版浏览器本地持仓迁移", createdAt: now, source: "legacy_migration", checksum: `legacy-${holdings.length}` },
    ],
  });
}
