import type { AppState, PortfolioSnapshot } from "@/domain/model";

export interface PortfolioRepository {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
  exportBackup(state: AppState): Promise<string>;
  importBackup(raw: string): Promise<AppState>;
  createSnapshot(state: AppState, reason: string): Promise<PortfolioSnapshot>;
  restoreSnapshot(state: AppState, snapshotId: string): Promise<AppState>;
}
