import { AppStateSchema, type AppState, type PortfolioSnapshot } from "@/domain/model";
import type { PortfolioRepository } from "./repository";

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

const TABLE = "app_state";
const STATE_ROW_ID = "primary";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Supabase REST (PostgREST) repository. Requires a single-row table:
 *
 * ```sql
 * create table app_state (
 *   id text primary key,
 *   state jsonb not null,
 *   updated_at timestamptz not null default now()
 * );
 * alter table app_state enable row level security;
 * create policy "owner app state" on app_state for all
 *   using (auth.uid() is not null) with check (auth.uid() is not null);
 * ```
 *
 * Enable it by setting NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Without them the app stays local-first.
 */
export class SupabasePortfolioRepository implements PortfolioRepository {
  private baseUrl: string;
  private anonKey: string;

  constructor(url?: string, anonKey?: string) {
    this.baseUrl = (url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    this.anonKey = anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  }

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return fetch(`${this.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Supabase 同步失败：HTTP ${response.status}`);
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    });
  }

  async load(): Promise<AppState | null> {
    const rows = await this.request<Array<{ id: string; state?: unknown }>>(`${TABLE}?id=eq.${STATE_ROW_ID}&select=id,state`);
    const stored = rows[0]?.state;
    if (!stored) return null;
    return AppStateSchema.parse({ reviews: [], ...(stored as object) });
  }

  async save(state: AppState): Promise<void> {
    await this.request(`${TABLE}?id=eq.${STATE_ROW_ID}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: STATE_ROW_ID, state, updated_at: new Date().toISOString() }),
    });
  }

  async clear(): Promise<void> {
    await this.request(`${TABLE}?id=eq.${STATE_ROW_ID}`, { method: "DELETE" });
  }

  async exportBackup(state: AppState): Promise<string> {
    return JSON.stringify(AppStateSchema.parse(state), null, 2);
  }

  async importBackup(raw: string): Promise<AppState> {
    const parsed: unknown = JSON.parse(raw);
    return AppStateSchema.parse({ reviews: [], ...(parsed as object) });
  }

  async createSnapshot(state: AppState, reason: string): Promise<PortfolioSnapshot> {
    const createdAt = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      versionId: state.dataVersions.at(-1)?.id ?? "unknown",
      createdAt,
      reason,
      holdings: clone(state.holdings),
      cashBalances: clone(state.cashBalances),
      transactions: clone(state.transactions),
    };
  }

  async restoreSnapshot(state: AppState, snapshotId: string): Promise<AppState> {
    const snapshot = state.snapshots.find((item) => item.id === snapshotId);
    if (!snapshot) throw new Error("找不到指定备份");
    const now = new Date().toISOString();
    return AppStateSchema.parse({
      ...state,
      updatedAt: now,
      mode: "local",
      holdings: clone(snapshot.holdings),
      cashBalances: clone(snapshot.cashBalances),
      transactions: clone(snapshot.transactions),
      dataVersions: [
        ...state.dataVersions,
        { id: crypto.randomUUID(), label: "备份恢复", reason: snapshot.reason, createdAt: now, source: "restore", checksum: snapshot.id },
      ],
    });
  }
}
