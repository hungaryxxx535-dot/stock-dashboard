import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const original = process.env.PORTFOLIO_CLOUD_SNAPSHOT;

afterEach(() => {
  if (original === undefined) delete process.env.PORTFOLIO_CLOUD_SNAPSHOT;
  else process.env.PORTFOLIO_CLOUD_SNAPSHOT = original;
});

describe("portfolio cloud endpoint", () => {
  it("stays unavailable when no cloud snapshot is configured", async () => {
    delete process.env.PORTFOLIO_CLOUD_SNAPSHOT;
    const response = await GET();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ available: false });
  });

  it("returns the configured snapshot without cache persistence", async () => {
    process.env.PORTFOLIO_CLOUD_SNAPSHOT = "example-token";
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ available: true, token: "example-token" });
  });
});
