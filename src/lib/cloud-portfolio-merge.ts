import type { AppState } from "@/domain/model";

export function mergeCloudPortfolioWithLocal(cloud: AppState, local: AppState | null): AppState {
  if (!local || local.mode === "demo") return cloud;
  const cloudInstrumentIds = new Set(cloud.instruments.map((item) => item.id));
  const cloudVersionIds = new Set(cloud.dataVersions.map((item) => item.id));
  return {
    ...cloud,
    instruments: [...cloud.instruments, ...local.instruments.filter((item) => !cloudInstrumentIds.has(item.id))],
    transactions: local.transactions,
    snapshots: local.snapshots,
    researchSnapshots: local.researchSnapshots,
    tradePlans: local.tradePlans,
    journalEntries: local.journalEntries,
    reviews: local.reviews,
    watchlists: local.watchlists,
    watchlistItems: local.watchlistItems,
    alerts: local.alerts,
    riskRules: local.riskRules,
    dataVersions: [...local.dataVersions.filter((item) => !cloudVersionIds.has(item.id)), ...cloud.dataVersions],
    settings: {
      ...local.settings,
      exchangeRates: cloud.settings.exchangeRates,
      cloudSync: "connected",
      updatedAt: cloud.updatedAt,
    },
  };
}
