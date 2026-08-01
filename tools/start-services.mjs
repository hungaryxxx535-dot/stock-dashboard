import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, ".local-private");
fs.mkdirSync(privateDir, { recursive: true });

async function probe(port, pathname = "/") {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function launch(command, args, cwd, label) {
  const out = fs.openSync(path.join(privateDir, `${label}.log`), "a");
  const err = fs.openSync(path.join(privateDir, `${label}.err.log`), "a");
  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, err],
  });
  child.unref();
  return child.pid;
}

const akshareUp = await probe(8000, "/health");
if (akshareUp) {
  console.log("AKShare 行情服务已在运行 (127.0.0.1:8000)");
} else {
  const pid = launch("python", ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"], path.join(root, "akshare-service"), "akshare");
  console.log(`AKShare 行情服务启动中 (PID ${pid}, 127.0.0.1:8000)`);
}

const devUp = await probe(3000);
if (devUp) {
  console.log("开发服务器已在运行 (http://localhost:3000)");
} else {
  const pid = process.platform === "win32"
    ? launch("cmd.exe", ["/c", "npm", "run", "dev"], root, "dev-server")
    : launch("npm", ["run", "dev"], root, "dev-server");
  console.log(`开发服务器启动中 (PID ${pid}, http://localhost:3000)`);
}

console.log("完成。浏览器打开 http://localhost:3000 使用平台。");
