import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const port = Number(process.env.SMOKE_PORT || 3213);
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const routes = [
  "/",
  "/a-live",
  "/analysis",
  "/hk",
  "/intelligence",
  "/review",
  "/system-status",
  "/trade-plan",
  "/trade-plan-v2",
  "/us-analysis",
  "/us-close",
];

const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TUSHARE_TOKEN: "",
    FRED_API_KEY: "",
    AKSHARE_API_URL: "http://127.0.0.1:9",
    AKSHARE_SERVICE_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function request(pathname, timeout = 30_000) {
  return fetch(`${baseUrl}${pathname}`, { signal: AbortSignal.timeout(timeout) });
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready.\n${serverOutput}`);
    }
    try {
      const response = await request("/", 2_000);
      if (response.ok) return;
    } catch {
      // The server can refuse connections briefly while booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Next.js did not become ready in time.\n${serverOutput}`);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

try {
  await waitUntilReady();

  for (const route of routes) {
    const response = await request(route);
    assert.equal(response.status, 200, `${route} returned HTTP ${response.status}`);
    const html = await response.text();
    assert.ok(html.includes("<html"), `${route} did not return an HTML document`);
    console.log(`PASS page ${route}`);
  }

  const marketResponse = await request("/api/market-intelligence", 75_000);
  assert.equal(marketResponse.status, 200, `market API returned HTTP ${marketResponse.status}`);
  const marketPayload = await marketResponse.json();
  assert.ok(Array.isArray(marketPayload.sourceStatus), "market API omitted sourceStatus");
  assert.ok(Array.isArray(marketPayload.warnings), "market API omitted warnings");
  assert.equal(typeof marketPayload.regime?.label, "string", "market API omitted regime");
  assert.ok(
    marketPayload.sourceStatus.some(
      (source) => source.id === "tushare" && source.status === "not_configured",
    ),
    "market API did not report missing TUSHARE_TOKEN",
  );
  assert.ok(
    marketPayload.sourceStatus.some(
      (source) => source.id === "akshare-live" && ["error", "not_configured"].includes(source.status),
    ),
    "market API did not degrade when AKShare was unreachable",
  );
  console.log("PASS market API degrades without Tushare/FRED keys and with unreachable AKShare");
} finally {
  await stopServer();
}
