import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const port = Number(process.env.SMOKE_PORT || 3213);
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const routes = [
  "/",
  "/portfolio",
  "/portfolio/import",
  "/market",
  "/research",
  "/research/DEMO-A1",
  "/research/watchlist",
  "/plans",
  "/plans/daily",
  "/paper",
  "/risk",
  "/journal",
  "/settings",
  "/system-status",
];

const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TUSHARE_TOKEN: "",
    FRED_API_KEY: "",
    AKSHARE_API_URL: "http://127.0.0.1:9",
    AKSHARE_SERVICE_TOKEN: "",
    HERMES_QUANT_API_TOKEN: "",
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

  const marketResponse = await request("/api/market", 75_000);
  assert.equal(marketResponse.status, 200, `market API returned HTTP ${marketResponse.status}`);
  const marketPayload = await marketResponse.json();
  assert.ok(Array.isArray(marketPayload.statuses), "market API omitted statuses");
  assert.ok(
    marketPayload.statuses.some(
      (source) => source.id === "tushare" && source.state === "not_configured",
    ),
    "market API did not report missing TUSHARE_TOKEN",
  );
  assert.ok(
    marketPayload.statuses.some(
      (source) => source.id === "akshare-live" && ["error", "not_configured", "timeout"].includes(source.state),
    ),
    "market API did not degrade when AKShare was unreachable",
  );
  console.log("PASS market API degrades without Tushare/FRED keys and with unreachable AKShare");

  const paperResponse = await request("/api/paper/status");
  assert.equal(paperResponse.status, 200, `paper status API returned HTTP ${paperResponse.status}`);
  const paperPayload = await paperResponse.json();
  assert.equal(paperPayload.available, false, "paper status API did not expose the expected safe degraded state");
  assert.equal(paperPayload.environment, "paper", "paper status API lost the paper safety boundary");
  console.log("PASS paper API degrades safely when the local token/service is unavailable");
} finally {
  await stopServer();
}
