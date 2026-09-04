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
import { buildPortfolioQuoteTargets, mergePortfolioQuotes, type PortfolioQuoteResponse } from "@/lib/portfolio-quotes";
import { loadMarketSummary } from "@/lib/market-summary";
import { generateDueAutomaticReviews } from "@/lib/automatic-reviews";
import { mergeCloudPortfolioWithLocal } from "@/lib/cloud-portfolio-merge";

type DataContextValue = {
  state: AppState; ready: boolean; error: string; legacyAvailable: boolean;
  save: (updater: (current: AppState) => AppState) => Promise<void>;
  replace: (next: AppState) => Promise<void>; migrateLegacy: () => Promise<void>;
  exportBackup: () => Promise<string>; importBackup: (raw: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>; resetDemo: () => Promise<void>;
  refreshQuotes: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);
const repository: PortfolioRepository = isSupabaseConfigured()
  ? new SupabasePortfolioRepository()
  : new IndexedDbPortfolioRepository();
const freshDemoState = (): AppState => {
  const now = new Date().toISOString();
  return AppStateSchema.parse({ ...structuredClone(demoState), initializedAt: now, updatedAt: now });
};

async function loadCloudPortfolio(): Promise<AppState | null> {
  const response = await fetch("/api/portfolio-cloud", { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`cloud portfolio request failed: ${response.status}`);
  const body = await response.json() as { available?: boolean; token?: unknown };
  if (!body.available || typeof body.token !== "string") throw new Error("cloud portfolio response is invalid");
  const decoded = decodePortfolioShare(body.token);
  const now = new Date().toISOString();
  return AppStateSchema.parse({
    ...decoded,
    mode: "cloud",
    updatedAt: now,
    dataVersions: decoded.dataVersions.map((version) => ({ ...version, label: "Render 云端持仓", reason: "从云端公开快照同步", source: "import" as const })),
    dataSourceStatuses: decoded.dataSourceStatuses.map((source) => ({ ...source, id: "render-cloud", name: "Render 云端持仓", source: "Render 环境变量", message: `${decoded.holdings.length} 项持仓已从云端同步` })),
    settings: { ...decoded.settings, cloudSync: "connected", updatedAt: now },
  });
}

async function loadLatestPortfolioQuotes(state: AppState): Promise<AppState> {
  const targets = buildPortfolioQuoteTargets(state);
  if (!targets.length) return state;
  const response = await fetch(`/api/portfolio-quotes?targets=${encodeURIComponent(targets.join(","))}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`portfolio quote request failed: ${response.status}`);
  const payload = await response.json() as PortfolioQuoteResponse;
  if (!Array.isArray(payload.quotes) || !Array.isArray(payload.missing)) throw new Error("portfolio quote response is invalid");
  return mergePortfolioQuotes(state, payload);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(freshDemoState);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const automaticReviewBusy = useRef(false);
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
      } else {
        try {
          const cloud = await loadCloudPortfolio();
          if (cloud) {
            next = mergeCloudPortfolioWithLocal(cloud, stored);
            try {
              next = await loadLatestPortfolioQuotes(next);
            } catch {
              setError("云端持仓已同步；公开行情暂时不可用，当前保留截图快照价格。");
            }
          }
        } catch {
          setError("云端持仓暂时不可用，当前显示本机最近一次数据。");
        }
        if (next.mode !== "demo") {
          const marketSummary = await loadMarketSummary().catch(() => ({ summary: "市场摘要读取失败", notes: ["自动复盘保留，市场环境部分降级。"], source: "" }));
          next = generateDueAutomaticReviews(next, new Date(), marketSummary).state;
        }
        if (!stored || next !== stored) await repository.save(next);
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
  const refreshQuotes = useCallback(async () => {
    try {
      const next = await loadLatestPortfolioQuotes(current.current);
      await repository.save(next); current.current = next; setState(next); setError("");
    } catch {
      setError("公开行情刷新失败，已保留最近一次有效价格和截图快照。");
    }
  }, []);
  useEffect(() => {
    if (!ready || state.mode === "demo") return;
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshQuotes(); };
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [ready, state.mode, refreshQuotes]);
  useEffect(() => {
    if (!ready || state.mode === "demo") return;
    const run = async () => {
      if (automaticReviewBusy.current) return;
      automaticReviewBusy.current = true;
      try {
        const marketSummary = await loadMarketSummary().catch(() => ({ summary: "市场摘要读取失败", notes: ["自动复盘保留，市场环境部分降级。"], source: "" }));
        const result = generateDueAutomaticReviews(current.current, new Date(), marketSummary);
        if (result.generated.length) {
          await repository.save(result.state);
          current.current = result.state;
          setState(result.state);
        }
      } finally { automaticReviewBusy.current = false; }
    };
    const whenVisible = () => { if (document.visibilityState === "visible") void run(); };
    const timer = window.setInterval(() => void run(), 300_000);
    document.addEventListener("visibilitychange", whenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", whenVisible); };
  }, [ready, state.mode]);
  const value = useMemo(() => ({ state, ready, error, legacyAvailable, save, replace, migrateLegacy, exportBackup, importBackup, restoreSnapshot, resetDemo, refreshQuotes }), [state, ready, error, legacyAvailable, save, replace, migrateLegacy, exportBackup, importBackup, restoreSnapshot, resetDemo, refreshQuotes]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function usePortfolioData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("usePortfolioData 必须在 DataProvider 内使用");
  return value;
}
