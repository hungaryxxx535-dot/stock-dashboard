import { z } from "zod";

export const CurrencySchema = z.enum(["CNY", "USD", "HKD"]);
export const MarketSchema = z.enum(["CN", "HK", "US", "CASH"]);
export const AccountOwnerSchema = z.enum(["self", "family"]);
export const HoldingStatusSchema = z.enum(["open", "closed", "watch"]);
export const TradePlanStatusSchema = z.enum([
  "draft",
  "waiting",
  "actionable",
  "partially_executed",
  "completed",
  "invalidated",
  "cancelled",
]);
export const ConfidenceSchema = z.number().min(0).max(100);

export const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  broker: z.string().min(1),
  market: MarketSchema,
  currency: CurrencySchema,
  owner: AccountOwnerSchema,
  isPrimary: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PortfolioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: AccountOwnerSchema,
  baseCurrency: CurrencySchema,
  accountIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InstrumentSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  market: MarketSchema,
  currency: CurrencySchema,
  assetType: z.enum(["stock", "etf", "cash", "fund", "other"]),
  sectors: z.array(z.string()),
  styles: z.array(z.string()),
  isLeveraged: z.boolean(),
});

export const HoldingSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  instrumentId: z.string().min(1),
  quantity: z.number(),
  brokerCost: z.number(),
  economicCost: z.number(),
  status: HoldingStatusSchema,
  thesis: z.string(),
  tags: z.array(z.string()),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const TransactionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  instrumentId: z.string().min(1),
  type: z.enum(["buy", "sell", "dividend", "split", "transfer_in", "transfer_out", "fee", "adjustment"]),
  quantity: z.number(),
  price: z.number(),
  fee: z.number().min(0),
  currency: CurrencySchema,
  executedAt: z.string(),
  note: z.string(),
});

export const CashBalanceSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().nullable(),
  label: z.string().min(1),
  currency: CurrencySchema,
  amount: z.number(),
  isOffsite: z.boolean(),
  updatedAt: z.string(),
});

export const QuoteSchema = z.object({
  instrumentId: z.string().min(1),
  price: z.number().nullable(),
  previousClose: z.number().nullable(),
  currency: CurrencySchema,
  marketTime: z.string().nullable(),
  fetchedAt: z.string(),
  source: z.string(),
  freshness: z.enum(["live", "delayed", "cached", "stale", "missing"]),
  isFallback: z.boolean(),
});

export const DataSourceStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  state: z.enum(["online", "partial", "timeout", "not_configured", "cached", "stale", "error"]),
  source: z.string(),
  marketTime: z.string().nullable(),
  fetchedAt: z.string(),
  delayed: z.boolean(),
  cached: z.boolean(),
  fallback: z.boolean(),
  message: z.string(),
});

export const ImportJobSchema = z.object({
  id: z.string().min(1),
  format: z.enum(["broker_image", "csv", "json", "manual", "legacy"]),
  status: z.enum(["parsed", "needs_review", "confirmed", "failed", "reverted"]),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  confidence: ConfidenceSchema,
  warnings: z.array(z.string()),
  rawRowCount: z.number().int().min(0),
  versionId: z.string().nullable(),
});

export const DataVersionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  reason: z.string(),
  createdAt: z.string(),
  source: z.enum(["demo", "manual", "import", "restore", "legacy_migration"]),
  checksum: z.string(),
});

export const PortfolioSnapshotSchema = z.object({
  id: z.string().min(1),
  versionId: z.string().min(1),
  createdAt: z.string(),
  reason: z.string(),
  holdings: z.array(HoldingSchema),
  cashBalances: z.array(CashBalanceSchema),
  transactions: z.array(TransactionSchema),
});

export const WatchlistItemSchema = z.object({
  id: z.string().min(1),
  instrumentId: z.string().min(1),
  horizon: z.enum(["short", "medium"]),
  source: z.enum(["manual", "system"]),
  score: z.number().min(0).max(100).nullable(),
  previousScore: z.number().min(0).max(100).nullable(),
  confidence: ConfidenceSchema,
  reasons: z.array(z.string()),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()),
  entryRange: z.string(),
  invalidation: z.string(),
  maxPositionPct: z.number().min(0).max(100),
  correlationWarning: z.string(),
  updatedAt: z.string(),
});

export const WatchlistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  itemIds: z.array(z.string()),
  updatedAt: z.string(),
});

export const ResearchSnapshotSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  scope: z.enum(["market", "portfolio", "instrument"]),
  score: z.number().min(0).max(100).nullable(),
  confidence: ConfidenceSchema,
  dataTime: z.string().nullable(),
  createdAt: z.string(),
  positiveEvidence: z.array(z.string()),
  negativeEvidence: z.array(z.string()),
  missingData: z.array(z.string()),
  invalidation: z.array(z.string()),
  conclusion: z.string(),
});

export const TradePlanSchema = z.object({
  id: z.string().min(1),
  instrumentId: z.string().min(1),
  market: MarketSchema,
  direction: z.enum(["buy", "sell", "hold", "reduce", "observe"]),
  planType: z.enum(["swing", "short_term", "risk_reduction", "rebalance"]),
  targetPositionPct: z.number().min(0).max(100),
  entryCondition: z.string(),
  entryRange: z.string(),
  addCondition: z.string(),
  reduceCondition: z.string(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  invalidation: z.string(),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()),
  validUntil: z.string(),
  status: TradePlanStatusSchema,
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const JournalEntrySchema = z.object({
  id: z.string().min(1),
  instrumentId: z.string().min(1),
  planId: z.string().nullable(),
  originalThesis: z.string(),
  plannedAction: z.string(),
  actualAction: z.string(),
  executedAt: z.string(),
  price: z.number(),
  quantity: z.number(),
  pnl: z.number(),
  followedPlan: z.boolean(),
  processQuality: z.enum(["correct", "incorrect"]),
  resultQuality: z.enum(["profit", "loss", "flat"]),
  strengths: z.array(z.string()),
  mistakes: z.array(z.string()),
  emotion: z.string(),
  lessons: z.array(z.string()),
  nextRules: z.array(z.string()),
  attachmentRefs: z.array(z.string()),
});

export const ReviewHoldingChangeSchema = z.object({
  instrumentId: z.string().min(1),
  symbol: z.string(),
  name: z.string(),
  market: z.string(),
  startQuantity: z.number().nullable(),
  endQuantity: z.number(),
  startPrice: z.number().nullable(),
  endPrice: z.number().nullable(),
  status: z.enum(["added", "removed", "changed", "unchanged"]),
});

export const ReviewSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["weekly", "monthly"]),
  periodStart: z.string(),
  periodEnd: z.string(),
  createdAt: z.string(),
  title: z.string(),
  summary: z.string(),
  portfolio: z.object({
    startValue: z.number().nullable(),
    endValue: z.number().nullable(),
    changePct: z.number().nullable(),
    note: z.string(),
  }),
  holdings: z.array(ReviewHoldingChangeSchema),
  plans: z.object({
    created: z.number(),
    completed: z.number(),
    invalidated: z.number(),
    active: z.number(),
    touched: z.array(z.object({ id: z.string(), symbol: z.string(), status: z.string(), updatedAt: z.string() })),
  }),
  journal: z.object({
    count: z.number(),
    followedPlan: z.number(),
    processCorrect: z.number(),
    resultProfit: z.number(),
    resultLoss: z.number(),
    lessons: z.array(z.string()),
  }),
  risk: z.object({
    startPositionPct: z.number().nullable(),
    endPositionPct: z.number().nullable(),
    startLargestPct: z.number().nullable(),
    endLargestPct: z.number().nullable(),
    warnings: z.array(z.string()),
  }),
  market: z.object({
    summary: z.string(),
    notes: z.array(z.string()),
    source: z.string(),
  }),
  dataQuality: z.array(z.string()),
});

export const RiskRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  metric: z.string().min(1),
  warningThreshold: z.number(),
  criticalThreshold: z.number(),
  enabled: z.boolean(),
});

export const AlertSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().min(1),
  reason: z.string(),
  impactAmount: z.number().nullable(),
  impactPct: z.number().nullable(),
  reviewAction: z.string(),
  planId: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const UserSettingsSchema = z.object({
  id: z.literal("default"),
  baseCurrency: CurrencySchema,
  exchangeRates: z.record(CurrencySchema, z.number().positive()),
  maxTotalPositionPct: z.number().min(0).max(100),
  maxSinglePositionPct: z.number().min(0).max(100),
  maxTechnologyExposurePct: z.number().min(0).max(100),
  maxRiskPerTradePct: z.number().min(0).max(100),
  theme: z.enum(["light", "dark", "system"]),
  cloudSync: z.enum(["disabled", "supabase_ready", "connected"]),
  timezone: z.string(),
  updatedAt: z.string(),
});

export const AppStateSchema = z.object({
  schemaVersion: z.literal(2),
  initializedAt: z.string(),
  updatedAt: z.string(),
  mode: z.enum(["demo", "local", "cloud"]),
  accounts: z.array(AccountSchema),
  portfolios: z.array(PortfolioSchema),
  instruments: z.array(InstrumentSchema),
  holdings: z.array(HoldingSchema),
  transactions: z.array(TransactionSchema),
  cashBalances: z.array(CashBalanceSchema),
  quotes: z.array(QuoteSchema),
  snapshots: z.array(PortfolioSnapshotSchema),
  importJobs: z.array(ImportJobSchema),
  dataVersions: z.array(DataVersionSchema),
  watchlists: z.array(WatchlistSchema),
  watchlistItems: z.array(WatchlistItemSchema),
  researchSnapshots: z.array(ResearchSnapshotSchema),
  tradePlans: z.array(TradePlanSchema),
  journalEntries: z.array(JournalEntrySchema),
  reviews: z.array(ReviewSchema),
  riskRules: z.array(RiskRuleSchema),
  alerts: z.array(AlertSchema),
  dataSourceStatuses: z.array(DataSourceStatusSchema),
  settings: UserSettingsSchema,
});

export type Account = z.infer<typeof AccountSchema>;
export type Portfolio = z.infer<typeof PortfolioSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Holding = z.infer<typeof HoldingSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type CashBalance = z.infer<typeof CashBalanceSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;
export type ImportJob = z.infer<typeof ImportJobSchema>;
export type DataVersion = z.infer<typeof DataVersionSchema>;
export type Watchlist = z.infer<typeof WatchlistSchema>;
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;
export type ResearchSnapshot = z.infer<typeof ResearchSnapshotSchema>;
export type TradePlan = z.infer<typeof TradePlanSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type RiskRule = z.infer<typeof RiskRuleSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type DataSourceStatus = z.infer<typeof DataSourceStatusSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type AppState = z.infer<typeof AppStateSchema>;
