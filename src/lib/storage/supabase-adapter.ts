import type { AppState } from "@/domain/model";
import type { PortfolioRepository } from "./repository";

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export class SupabasePortfolioRepository implements PortfolioRepository {
  private unavailable(): never {
    throw new Error("Supabase 云同步适配器已预留，但当前未连接。系统继续使用本地模式。");
  }
  load(): Promise<AppState | null> { return Promise.reject(this.unavailable()); }
  save(): Promise<void> { return Promise.reject(this.unavailable()); }
  clear(): Promise<void> { return Promise.reject(this.unavailable()); }
  exportBackup(): Promise<string> { return Promise.reject(this.unavailable()); }
  importBackup(): Promise<AppState> { return Promise.reject(this.unavailable()); }
  createSnapshot(): Promise<never> { return Promise.reject(this.unavailable()); }
  restoreSnapshot(): Promise<AppState> { return Promise.reject(this.unavailable()); }
}
