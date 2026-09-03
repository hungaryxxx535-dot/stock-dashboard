import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quantRequest } from "@/lib/quant-client";

describe("server-side quant client", () => {
  beforeEach(() => {
    vi.stubEnv("HERMES_QUANT_API_TOKEN", "fixture-token-123456789");
    vi.stubEnv("HERMES_QUANT_API_URL", "http://127.0.0.1:8765");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("rejects non-loopback API targets before making a request", async () => {
    vi.stubEnv("HERMES_QUANT_API_URL", "https://broker.example.com");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(quantRequest("/health")).rejects.toMatchObject({ code: "NON_LOOPBACK_REJECTED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only successful paper envelopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ environment: "paper", success: true, error_code: null, error_message: null, data: { status: "ok" } }), { status: 200 })));
    await expect(quantRequest<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
  });

  it("rejects a response that claims a non-paper environment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ environment: "live", success: true, error_code: null, error_message: null, data: {} }), { status: 200 })));
    await expect(quantRequest("/health")).rejects.toMatchObject({ code: "NON_PAPER_RESPONSE" });
  });
});
