import { expect, test } from "@playwright/test";

const routes = ["/", "/portfolio", "/portfolio/import", "/market", "/research", "/research/DEMO-A1", "/research/watchlist", "/plans", "/plans/daily", "/risk", "/journal", "/settings"];
for (const route of routes) test(`${route} renders without severe console errors`, async ({ page }, testInfo) => {
  const severe: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) severe.push(message.text()); });
  const response = await page.goto(route, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(severe).toEqual([]);
  if (["/", "/portfolio", "/market", "/risk"].includes(route)) {
    const slug = route === "/" ? "home" : route.slice(1);
    await page.screenshot({ path: `test-results/screenshots/${testInfo.project.name}-${slug}.png`, fullPage: true });
  }
});
test("mobile navigation leaves the main content accessible", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "移动端主导航" });
  if (await nav.isVisible()) {
    await expect(page.getByRole("heading", { name: "今日作战台" })).toBeVisible();
    const padding = await page.locator("main").evaluate((node) => getComputedStyle(node).paddingBottom);
    expect(Number.parseFloat(padding)).toBeGreaterThan(0);
  }
});
