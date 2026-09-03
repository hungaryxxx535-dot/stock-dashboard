import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, ".local-private");
const pidFile = path.join(privateDir, "quant-api.pid.json");
const stdoutFile = path.join(privateDir, "quant-api.stdout.log");
const stderrFile = path.join(privateDir, "quant-api.stderr.log");

function parseEnvFile(filename) {
  if (!fs.existsSync(filename)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const localEnv = parseEnvFile(path.join(root, ".env.local"));
const childEnv = { ...process.env, ...localEnv };
const host = childEnv.HERMES_QUANT_API_HOST || "127.0.0.1";
const port = Number(childEnv.HERMES_QUANT_API_PORT || 8765);
const token = childEnv.HERMES_QUANT_API_TOKEN || "";

if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  throw new Error("Refusing to operate a quant API configured on a non-loopback host");
}
if (!token || token.length < 16) {
  throw new Error("HERMES_QUANT_API_TOKEN is missing or too short in .env.local");
}

async function health() {
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.environment === "paper"
      && payload?.data?.status === "ok"
      && payload?.data?.bind === "loopback";
  } catch {
    return false;
  }
}

function readPid() {
  try {
    const parsed = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    return Number.isInteger(parsed.pid) && parsed.pid > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function start() {
  fs.mkdirSync(privateDir, { recursive: true });
  if (await health()) {
    console.log(`Quant API already running on ${host}:${port} (paper, loopback)`);
    return;
  }
  const out = fs.openSync(stdoutFile, "a");
  const err = fs.openSync(stderrFile, "a");
  const child = spawn("python", ["-m", "hermes_quant.cli", "serve-api"], {
    cwd: root,
    env: childEnv,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, err],
  });
  child.unref();
  fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, host, port, startedAt: new Date().toISOString() }), "utf8");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await health()) {
      console.log(`Quant API started (PID ${child.pid}, ${host}:${port}, paper, loopback)`);
      return;
    }
  }
  throw new Error(`Quant API did not become healthy; inspect ${stderrFile}`);
}

async function stop() {
  const state = readPid();
  if (!state) {
    if (await health()) throw new Error("Quant API is healthy but its verified PID file is missing; refusing blind termination");
    console.log("Quant API is not running");
    return;
  }
  if (!(await health())) {
    fs.rmSync(pidFile, { force: true });
    console.log(`Removed stale Quant API PID record ${state.pid}`);
    return;
  }
  try {
    process.kill(state.pid, "SIGTERM");
  } catch (error) {
    throw new Error(`Could not stop verified Quant API PID ${state.pid}: ${error.message}`);
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!(await health())) {
      fs.rmSync(pidFile, { force: true });
      console.log(`Quant API stopped (PID ${state.pid})`);
      return;
    }
  }
  throw new Error(`Quant API PID ${state.pid} did not stop within 5 seconds`);
}

async function status() {
  const state = readPid();
  const healthy = await health();
  console.log(JSON.stringify({ healthy, pid: state?.pid ?? null, host, port, environment: "paper", loopback: true }));
  if (!healthy) process.exitCode = 1;
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "status") await status();
else throw new Error("Usage: node tools/quant-api-service.mjs <start|stop|status>");
