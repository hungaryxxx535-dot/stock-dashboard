import { execFileSync } from "node:child_process";
import fs from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const forbiddenFiles = ["src/data/portfolio-runtime.ts", "src/data/latest-a-share-screenshot.ts", "src/data/latest-us-screenshot.ts", "bantuo-preview/index.html"];
const present = forbiddenFiles.filter((file) => tracked.includes(file));
if (present.length) throw new Error(`Forbidden tracked private/foreign files: ${present.join(", ")}`);
const secretPattern = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:^|[^A-Za-z0-9])(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{20,}|SUPABASE_(?:ANON_KEY|SERVICE_ROLE_KEY)\s*=\s*[^#\s]+)/m;
for (const file of tracked.filter((name) => !name.endsWith("package-lock.json"))) {
  let body = ""; try { body = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (secretPattern.test(body)) throw new Error(`Possible secret found in ${file}`);
}
console.log(`PASS scanned ${tracked.length} tracked files; no forbidden private data files or high-confidence secrets found.`);
