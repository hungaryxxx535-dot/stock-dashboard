"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppStateSchema, type AppState } from "@/domain/model";
import { demoState } from "@/domain/demo-state";
import { IndexedDbPortfolioRepository } from "@/lib/storage/indexeddb-repository";
import { hasLegacyBrowserData, migrateLegacyBrowserData } from "@/lib/storage/migration";
import type { PortfolioRepository } from "@/lib/storage/repository";
import { isSupabaseConfigured, SupabasePortfolioRepository } from "@/lib/storage/supabase-adapter";
import { decodePortfolioShare } from "@/lib/portfolio-share";

type DataContextValue = {
  state: AppState; ready: boolean; error: string; legacyAvailable: boolean;
  save: (updater: (current: AppState) => AppState) => Promise<void>;
  replace: (next: AppState) => Promise<void>; migrateLegacy: () => Promise<void>;
  exportBackup: () => Promise<string>; importBackup: (raw: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>; resetDemo: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);
const repository: PortfolioRepository = isSupabaseConfigured()
  ? new SupabasePortfolioRepository()
  : new IndexedDbPortfolioRepository();
const freshDemoState = (): AppState => {
  const now = new Date().toISOString();
  return AppStateSchema.parse({ ...structuredClone(demoState), initializedAt: now, updatedAt: now });
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(freshDemoState);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  useEffect(() => { current.current = state; }, [state]);
  useEffect(() => {
    let active = true;
    repository.load().then(async (stored) => {
      if (!active) return;
      const token = new URLSearchParams(window.location.hash.slice(1)).get("portfolio");
      let next = stored ?? freshDemoState();
      if (token && (!stored || stored.mode === "demo")) {
        try {
          next = decodePortfolioShare(token);
          await repository.save(next);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        } catch {
          setError("跨设备持仓链接无效或已损坏，未改变当前数据。");
        }
      } else if (token && stored?.mode !== "demo") {
        setError("当前浏览器已有私有持仓，未使用分享链接覆盖。请先导出备份，或在新设备中打开该链接。");
      } else if (!stored) {
        await repository.save(next);
      }
      current.current = next; setState(next);
      setLegacyAvailable(hasLegacyBrowserData(window.localStorage));
    }).catch(() => setError("本地数据库暂不可用；当前仅使用本次会话中的匿名演示数据。"))
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, []);
  const replace = useCallback(async (next: AppState) => {
    const validated = AppStateSchema.parse({ ...next, updatedAt: new Date().toISOString() });
    await repository.save(validated); current.current = validated; setState(validated);
  }, []);
  const save = useCallback(async (updater: (value: AppState) => AppState) => replace(updater(current.current)), [replace]);
  const migrateLegacy = useCallback(async () => {
    const snapshot = await repository.createSnapshot(current.current, "旧版数据迁移前自动备份");
    await replace(migrateLegacyBrowserData({ ...current.current, snapshots: [...current.current.snapshots, snapshot] }, window.localStorage));
    setLegacyAvailable(false);
  }, [replace]);
  const exportBackup = useCallback(() => repository.exportBackup(current.current), []);
  const importBackup = useCallback(async (raw: string) => {
    const snapshot = await repository.createSnapshot(current.current, "导入备份前自动备份");
    const imported = await repository.importBackup(raw);
    await replace({ ...imported, snapshots: [...imported.snapshots, snapshot], mode: "local" });
  }, [replace]);
  const restoreSnapshot = useCallback(async (id: string) => replace(await repository.restoreSnapshot(current.current, id)), [replace]);
  const resetDemo = useCallback(() => replace(freshDemoState()), [replace]);
  const value = useMemo(() => ({ state, ready, error, legacyAvailable, save, replace, migrateLegacy, exportBackup, importBackup, restoreSnapshot, resetDemo }), [state, ready, error, legacyAvailable, save, replace, migrateLegacy, exportBackup, importBackup, restoreSnapshot, resetDemo]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function usePortfolioData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("usePortfolioData 必须在 DataProvider 内使用");
  return value;
}
