import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, ".local-private");

for (const label of ["dev-server", "akshare"]) {
  const pidFile = path.join(privateDir, `${label}.pid`);
  if (!fs.existsSync(pidFile)) {
    console.log(`${label}: no recorded PID`);
    continue;
  }
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!/^\d+$/.test(raw)) throw new Error(`${label}: invalid PID file`);
  const pid = Number(raw);
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGTERM");
    console.log(`${label}: stopped PID ${pid}`);
  } catch {
    console.log(`${label}: PID ${pid} was not running`);
  } finally {
    fs.rmSync(pidFile, { force: true });
  }
}
