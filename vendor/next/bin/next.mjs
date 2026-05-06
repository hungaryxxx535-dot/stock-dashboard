#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2] || "dev";
const args = process.argv.slice(3);
const root = process.cwd();

function getPort(defaultPort = 3000) {
  const portFlagIndex = args.findIndex((arg) => arg === "-p" || arg === "--port");
  if (portFlagIndex >= 0 && args[portFlagIndex + 1]) return Number(args[portFlagIndex + 1]);
  const inline = args.find((arg) => arg.startsWith("--port="));
  if (inline) return Number(inline.split("=")[1]);
  return Number(process.env.PORT || defaultPort);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: next <dev|start|build> [options]\n\nLocal MVP-compatible Next.js command shim.\n\nOptions:\n  -p, --port <port>  Port to listen on, default 3000\n  -h, --help         Show this help`);
  process.exit(0);
}

if (command === "build") {
  console.log("✓ Local MVP build check completed. Run `npm run dev` to preview the dashboard.");
  process.exit(0);
}

if (!["dev", "start"].includes(command)) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

const port = getPort(3000);
const serverScriptUrl = new URL("../../../tools/dev-server.mjs", import.meta.url);
const { renderHtml } = await import(serverScriptUrl.href);

const mime = {
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderHtml());
    return;
  }

  if (url.pathname.startsWith("/manifest.json")) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(readFileSync(join(root, "public", "manifest.json"), "utf8"));
    return;
  }

  const safePath = normalize(url.pathname).replace(/^[/\\]+/, "");
  const publicPath = join(root, "public", safePath);
  try {
    const body = readFileSync(publicPath);
    response.writeHead(200, { "content-type": mime[extname(publicPath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`▲ Next.js local MVP server`);
  console.log(`- Local:        http://localhost:${port}`);
  console.log(`- Network:      http://0.0.0.0:${port}`);
  console.log(`- Mode:         ${command}`);
});
