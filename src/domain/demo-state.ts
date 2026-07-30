import type { AppState } from "./model";

const now = "2026-01-01T00:00:00.000Z";

export const demoState: AppState = {
  schemaVersion: 2,
  initializedAt: now,
  updatedAt: now,
  mode: "demo",
  accounts: [
    { id: "demo-cn", name: "示例 A 股账户", broker: "演示券商", market: "CN", currency: "CNY", owner: "self", isPrimary: true, createdAt: now, updatedAt: now },
    { id: "demo-us", name: "示例美股账户", broker: "演示券商", market: "US", currency: "USD", owner: "self", isPrimary: false, createdAt: now, updatedAt: now },
  ],
  portfolios: [{ id: "demo-main", name: "匿名演示组合", owner: "self", baseCurrency: "CNY", accountIds: ["demo-cn", "demo-us"], createdAt: now, updatedAt: now }],
  instruments: [
    { id: "demo-a1", symbol: "DEMO-A1", name: "示例成长 ETF", market: "CN", currency: "CNY", assetType: "etf", sectors: ["科技"], styles: ["成长"], isLeveraged: false },
    { id: "demo-a2", symbol: "DEMO-A2", name: "示例防御股", market: "CN", currency: "CNY", assetType: "stock", sectors: ["金融"], styles: ["价值", "防御"], isLeveraged: false },
    { id: "demo-us1", symbol: "DEMO-US1", name: "示例美股科技", market: "US", currency: "USD", assetType: "stock", sectors: ["科技"], styles: ["成长"], isLeveraged: false },
    { id: "demo-etf", symbol: "DEMO-ETF", name: "示例黄金 ETF", market: "CN", currency: "CNY", assetType: "etf", sectors: ["贵金属"], styles: ["防御"], isLeveraged: false },
  ],
  holdings: [
    { id: "holding-a1", accountId: "demo-cn", instrumentId: "demo-a1", quantity: 10000, brokerCost: 1, economicCost: 1, status: "open", thesis: "匿名演示数据，仅用于展示结构。", tags: ["核心仓"], openedAt: now, closedAt: null, updatedAt: now },
    { id: "holding-a2", accountId: "demo-cn", instrumentId: "demo-a2", quantity: 1500, brokerCost: 20, economicCost: 20, status: "open", thesis: "匿名防御仓示例。", tags: ["防御仓"], openedAt: now, closedAt: null, updatedAt: now },
    { id: "holding-us1", accountId: "demo-us", instrumentId: "demo-us1", quantity: 20, brokerCost: 100, economicCost: 100, status: "open", thesis: "匿名美股仓位示例。", tags: ["成长"], openedAt: now, closedAt: null, updatedAt: now },
    { id: "holding-etf", accountId: "demo-cn", instrumentId: "demo-etf", quantity: 500, brokerCost: 8, economicCost: 8, status: "open", thesis: "组合防御资产示例。", tags: ["防御仓"], openedAt: now, closedAt: null, updatedAt: now },
  ],
  transactions: [],
  cashBalances: [
    { id: "cash-cn", accountId: "demo-cn", label: "账户现金", currency: "CNY", amount: 30000, isOffsite: false, updatedAt: now },
    { id: "cash-offsite", accountId: null, label: "场外现金", currency: "CNY", amount: 20000, isOffsite: true, updatedAt: now },
    { id: "cash-us", accountId: "demo-us", label: "美股账户现金", currency: "USD", amount: 1000, isOffsite: false, updatedAt: now },
  ],
  quotes: ["demo-a1", "demo-a2", "demo-us1", "demo-etf"].map((instrumentId) => ({
    instrumentId, price: null, previousClose: null, currency: instrumentId === "demo-us1" ? "USD" as const : "CNY" as const,
    marketTime: null, fetchedAt: now, source: "匿名演示数据", freshness: "missing" as const, isFallback: true,
  })),
  snapshots: [],
  importJobs: [],
  dataVersions: [{ id: "version-demo", label: "匿名演示基线", reason: "公开仓库默认数据", createdAt: now, source: "demo", checksum: "demo-v2" }],
  watchlists: [{ id: "watch-default", name: "默认观察池", itemIds: ["watch-demo"], updatedAt: now }],
  watchlistItems: [{ id: "watch-demo", instrumentId: "demo-us1", horizon: "medium", source: "manual", score: null, previousScore: null, confidence: 20, reasons: ["尚未接入基本面与实时行情"], catalysts: [], risks: ["数据不足"], entryRange: "等待数据", invalidation: "缺少有效行情与基本面", maxPositionPct: 5, correlationWarning: "与示例科技仓相关", updatedAt: now }],
  researchSnapshots: [],
  tradePlans: [{ id: "plan-demo", instrumentId: "demo-a1", market: "CN", direction: "observe", planType: "swing", targetPositionPct: 10, entryCondition: "等待有效行情与市场环境确认", entryRange: "未设置", addCondition: "未设置", reduceCondition: "科技暴露超过上限时复核", stopLoss: null, takeProfit: null, invalidation: "数据持续缺失", catalysts: [], risks: ["演示数据不可用于交易"], validUntil: "2026-12-31T23:59:59.000Z", status: "waiting", note: "演示计划，不构成交易建议。", createdAt: now, updatedAt: now }],
  journalEntries: [],
  riskRules: [
    { id: "risk-total", name: "总仓位上限", metric: "totalPositionPct", warningThreshold: 75, criticalThreshold: 90, enabled: true },
    { id: "risk-single", name: "单标的集中度", metric: "maxSinglePositionPct", warningThreshold: 15, criticalThreshold: 25, enabled: true },
    { id: "risk-tech", name: "科技暴露", metric: "technologyExposurePct", warningThreshold: 55, criticalThreshold: 70, enabled: true },
  ],
  alerts: [],
  dataSourceStatuses: [{ id: "local", name: "本地数据库", state: "online", source: "IndexedDB", marketTime: null, fetchedAt: now, delayed: false, cached: true, fallback: false, message: "匿名演示数据已加载；真实数据只保存在本机。" }],
  settings: { id: "default", baseCurrency: "CNY", exchangeRates: { CNY: 1, USD: 7.2, HKD: 0.92 }, maxTotalPositionPct: 80, maxSinglePositionPct: 20, maxTechnologyExposurePct: 60, maxRiskPerTradePct: 1, theme: "system", cloudSync: "disabled", timezone: "Asia/Shanghai", updatedAt: now },
};
