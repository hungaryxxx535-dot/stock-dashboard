import { AppStateSchema, type AppState, type PortfolioSnapshot } from "@/domain/model";
import type { PortfolioRepository } from "./repository";

const DATABASE_NAME = "feige-stock-war-room-v2";
const STORE_NAME = "app-state";
const STATE_KEY = "primary";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** New collections that older local states may lack get empty defaults. */
function withStateDefaults(value: unknown): AppState {
  const base = (value ?? {}) as Partial<AppState>;
  return AppStateSchema.parse({ reviews: [], ...base });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("本地数据库无法打开"));
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("本地数据库操作失败"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(new Error("本地数据库事务失败"));
  });
}

export class IndexedDbPortfolioRepository implements PortfolioRepository {
  async load(): Promise<AppState | null> {
    const value = await runTransaction<unknown>("readonly", (store) => store.get(STATE_KEY));
    if (!value) return null;
    return withStateDefaults(value);
  }

  async save(state: AppState): Promise<void> {
    const validated = AppStateSchema.parse(state);
    await runTransaction<IDBValidKey>("readwrite", (store) => store.put(clone(validated), STATE_KEY));
  }

  async clear(): Promise<void> {
    await runTransaction<undefined>("readwrite", (store) => store.delete(STATE_KEY));
  }

  async exportBackup(state: AppState): Promise<string> {
    return JSON.stringify(AppStateSchema.parse(state), null, 2);
  }

  async importBackup(raw: string): Promise<AppState> {
    const parsed: unknown = JSON.parse(raw);
    return withStateDefaults(parsed);
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
