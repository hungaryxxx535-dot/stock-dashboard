import { afterEach, describe, expect, it, vi } from "vitest";
import { demoState } from "@/domain/demo-state";
import { isSupabaseConfigured, SupabasePortfolioRepository } from "./supabase-adapter";

const URL = "https://example.supabase.co";
const KEY = "anon-key";

describe("supabase adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("detects configuration from public env vars", () => {
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", KEY);
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("loads a stored state and defaults missing reviews", async () => {
    const state = structuredClone(demoState) as Record<string, unknown>;
    delete state.reviews;
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: "primary", state }],
    });
    vi.stubGlobal("fetch", fetch);

    const loaded = await new SupabasePortfolioRepository(URL, KEY).load();
    expect(loaded?.reviews).toEqual([]);
    expect(loaded?.schemaVersion).toBe(2);
    expect(String(fetch.mock.calls[0][0])).toContain("/rest/v1/app_state?id=eq.primary&select=id,state");
  });

  it("returns null when no row exists", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetch);
    const loaded = await new SupabasePortfolioRepository(URL, KEY).load();
    expect(loaded).toBeNull();
  });

  it("upserts state on save", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    vi.stubGlobal("fetch", fetch);
    await new SupabasePortfolioRepository(URL, KEY).save(structuredClone(demoState));
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("/rest/v1/app_state?id=eq.primary");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).state.schemaVersion).toBe(2);
  });

  it("clears the row", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    vi.stubGlobal("fetch", fetch);
    await new SupabasePortfolioRepository(URL, KEY).clear();
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("surfaces HTTP errors instead of silently failing", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetch);
    await expect(new SupabasePortfolioRepository(URL, KEY).load()).rejects.toThrow("HTTP 401");
  });
});
