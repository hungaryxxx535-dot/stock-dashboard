import { expect, test } from "@playwright/test";

const routes = ["/", "/portfolio", "/portfolio/import", "/market", "/research", "/research/DEMO-A1", "/research/watchlist", "/plans", "/plans/daily", "/risk", "/journal", "/settings"];
for (const route of routes) test(`${route} renders without severe console errors`, async ({ page }, testInfo) => {
  const severe: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) severe.push(message.text()); });
  // The market page intentionally keeps slow external fallbacks in flight; its
  // degradation contract is asserted by the smoke test, so page availability
  // must not depend on third-party requests reaching network idle.
  const response = await page.goto(route, { waitUntil: route === "/market" ? "domcontentloaded" : "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  if (route === "/market") await page.waitForTimeout(1_000);
  expect(severe).toEqual([]);
  if (["/", "/portfolio", "/portfolio/import", "/market", "/risk"].includes(route)) {
    const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
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

test("portfolio separates A-share, US and Hong Kong holdings without manual-add form", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "我的A股" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的美股" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的港股" })).toBeVisible();
  await expect(page.getByText("手工新增持仓")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "上传持仓截图" })).toBeVisible();
});

test("screenshot import exposes market selection and local OCR upload", async ({ page }) => {
  await page.goto("/portfolio/import");
  await expect(page.getByRole("heading", { name: "持仓截图导入" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "截图所属市场" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /A股/ })).toBeChecked();
  await expect(page.getByText("选择或拍摄持仓截图")).toBeVisible();
  await expect(page.getByRole("button", { name: "开始识别截图" })).toBeDisabled();
});
