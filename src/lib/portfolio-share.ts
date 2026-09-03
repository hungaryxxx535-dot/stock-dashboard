import { z } from "zod";
import { AppStateSchema, type AppState } from "@/domain/model";

const SharedSnapshotSchema = z.object({
  v: z.literal(1),
  at: z.string(),
  a: z.array(z.object({ n: z.string(), b: z.string(), m: z.enum(["CN", "HK", "US", "CASH"]), c: z.enum(["CNY", "USD", "HKD"]), p: z.boolean() })),
  h: z.array(z.object({
    a: z.number().int().nonnegative(), s: z.string(), n: z.string(), m: z.enum(["CN", "HK", "US", "CASH"]),
    c: z.enum(["CNY", "USD", "HKD"]), t: z.enum(["stock", "etf", "cash", "fund", "other"]),
    se: z.array(z.string()), st: z.array(z.string()), q: z.number(), bc: z.number(), ec: z.number(), p: z.number().nullable(),
  })),
  c: z.array(z.object({ a: z.number().int().nonnegative().nullable(), l: z.string(), c: z.enum(["CNY", "USD", "HKD"]), v: z.number(), o: z.boolean() })),
  x: z.record(z.enum(["CNY", "USD", "HKD"]), z.number().positive()),
  r: z.object({ t: z.number().min(0).max(100), s: z.number().min(0).max(100), k: z.number().min(0).max(100), p: z.number().min(0).max(100) }),
});

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodePortfolioShare(state: AppState): string {
  const accountIndex = new Map(state.accounts.map((account, index) => [account.id, index]));
  const holdings = state.holdings.flatMap((holding) => {
    if (holding.status !== "open" || holding.quantity <= 0) return [];
    const instrument = state.instruments.find((item) => item.id === holding.instrumentId);
    const account = accountIndex.get(holding.accountId);
    if (!instrument || account === undefined) return [];
    const quote = state.quotes.find((item) => item.instrumentId === holding.instrumentId);
    return [{ a: account, s: instrument.symbol, n: instrument.name, m: instrument.market, c: instrument.currency, t: instrument.assetType, se: instrument.sectors, st: instrument.styles, q: holding.quantity, bc: holding.brokerCost, ec: holding.economicCost, p: quote?.price ?? null }];
  });
  const payload = {
    v: 1 as const, at: new Date().toISOString(),
    a: state.accounts.map((account) => ({ n: account.name, b: account.broker, m: account.market, c: account.currency, p: account.isPrimary })),
    h: holdings,
    c: state.cashBalances.map((cash) => ({ a: cash.accountId === null ? null : accountIndex.get(cash.accountId) ?? null, l: cash.label, c: cash.currency, v: cash.amount, o: cash.isOffsite })),
    x: state.settings.exchangeRates,
    r: { t: state.settings.maxTotalPositionPct, s: state.settings.maxSinglePositionPct, k: state.settings.maxTechnologyExposurePct, p: state.settings.maxRiskPerTradePct },
  };
  return toBase64Url(JSON.stringify(SharedSnapshotSchema.parse(payload)));
}

export function createPortfolioShareUrl(state: AppState, origin: string): string {
  return `${origin.replace(/\/$/, "")}/#portfolio=${encodePortfolioShare(state)}`;
}

export function decodePortfolioShare(token: string): AppState {
  const payload = SharedSnapshotSchema.parse(JSON.parse(fromBase64Url(token)));
  const now = new Date().toISOString();
  const accounts = payload.a.map((account, index) => ({ id: `shared-account-${index}`, name: account.n, broker: account.b, market: account.m, currency: account.c, owner: "self" as const, isPrimary: account.p, createdAt: payload.at, updatedAt: now }));
  const instruments: AppState["instruments"] = [];
  const holdings: AppState["holdings"] = [];
  const quotes: AppState["quotes"] = [];
  const instrumentIds = new Map<string, string>();
  payload.h.forEach((row, index) => {
    if (!accounts[row.a]) throw new Error("分享数据包含无效账户引用");
    const key = `${row.m}:${row.s}`;
    let instrumentId = instrumentIds.get(key);
    if (!instrumentId) {
      instrumentId = `shared-instrument-${instruments.length}`;
      instrumentIds.set(key, instrumentId);
      instruments.push({ id: instrumentId, symbol: row.s, name: row.n, market: row.m, currency: row.c, assetType: row.t, sectors: row.se, styles: row.st, isLeveraged: false });
      quotes.push({ instrumentId, price: row.p, previousClose: null, currency: row.c, marketTime: null, fetchedAt: payload.at, source: "跨设备持仓链接", freshness: row.p === null ? "missing" : "delayed", isFallback: false });
    }
    holdings.push({ id: `shared-holding-${index}`, accountId: accounts[row.a].id, instrumentId, quantity: row.q, brokerCost: row.bc, economicCost: row.ec, status: "open", thesis: "", tags: ["跨设备导入"], openedAt: payload.at, closedAt: null, updatedAt: now });
  });
  const cashBalances = payload.c.map((cash, index) => ({ id: `shared-cash-${index}`, accountId: cash.a === null ? null : accounts[cash.a]?.id ?? null, label: cash.l, currency: cash.c, amount: cash.v, isOffsite: cash.o, updatedAt: now }));
  return AppStateSchema.parse({
    schemaVersion: 2, initializedAt: now, updatedAt: now, mode: "local",
    accounts, portfolios: [{ id: "shared-portfolio", name: "跨设备持仓", owner: "self", baseCurrency: "CNY", accountIds: accounts.map((account) => account.id), createdAt: now, updatedAt: now }],
    instruments, holdings, transactions: [], cashBalances, quotes, snapshots: [],
    importJobs: [{ id: "shared-import", format: "json", status: "confirmed", startedAt: now, completedAt: now, confidence: 100, warnings: [], rawRowCount: holdings.length, versionId: "shared-version" }],
    dataVersions: [{ id: "shared-version", label: "跨设备持仓链接", reason: "由用户主动生成并在本设备打开", createdAt: now, source: "import", checksum: token.slice(0, 24) }],
    watchlists: [{ id: "watch-default", name: "默认观察池", itemIds: [], updatedAt: now }], watchlistItems: [], researchSnapshots: [], tradePlans: [], journalEntries: [], reviews: [],
    riskRules: [
      { id: "risk-total", name: "总仓位上限", metric: "totalPositionPct", warningThreshold: 75, criticalThreshold: 90, enabled: true },
      { id: "risk-single", name: "单标的集中度", metric: "maxSinglePositionPct", warningThreshold: 15, criticalThreshold: 25, enabled: true },
      { id: "risk-tech", name: "科技暴露", metric: "technologyExposurePct", warningThreshold: 55, criticalThreshold: 70, enabled: true },
    ], alerts: [],
    dataSourceStatuses: [{ id: "shared-link", name: "跨设备持仓链接", state: "online", source: "URL 片段本地导入", marketTime: payload.at, fetchedAt: now, delayed: true, cached: true, fallback: false, message: `${holdings.length} 项持仓已写入当前设备` }],
    settings: { id: "default", baseCurrency: "CNY", exchangeRates: payload.x, maxTotalPositionPct: payload.r.t, maxSinglePositionPct: payload.r.s, maxTechnologyExposurePct: payload.r.k, maxRiskPerTradePct: payload.r.p, theme: "system", cloudSync: "disabled", timezone: "Asia/Shanghai", updatedAt: now },
  });
}
