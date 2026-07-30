import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  outputDir: "test-results",
  use: { baseURL: "http://127.0.0.1:3214", trace: "retain-on-failure", channel: "chrome" },
  webServer: { command: "npm run start -- -H 127.0.0.1 -p 3214", url: "http://127.0.0.1:3214", reuseExistingServer: false, timeout: 60_000 },
  projects: [
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "mobile-430", use: { viewport: { width: 430, height: 932 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
