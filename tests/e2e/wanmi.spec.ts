import fs from "node:fs";
import { expect, test } from "@playwright/test";

function localCredentials(): { email: string; password: string } {
  if (process.env.ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    return {
      email: process.env.ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    };
  }

  if (!fs.existsSync(".dev.vars")) {
    throw new Error("缺少 E2E 管理员凭据：请设置环境变量或创建 .dev.vars");
  }

  const vars = Object.fromEntries(
    fs.readFileSync(".dev.vars", "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  if (!vars.ADMIN_EMAIL || !vars.BOOTSTRAP_ADMIN_PASSWORD) throw new Error("缺少本地 E2E 管理员凭据");
  return { email: vars.ADMIN_EMAIL, password: vars.BOOTSTRAP_ADMIN_PASSWORD };
}

/** 域名列表页的搜索框没有提交按钮（黑金设计），用回车提交 */
async function searchDomains(page: import("@playwright/test").Page, keyword: string) {
  const search = page.getByRole("textbox", { name: "搜索域名、后缀或关键词" });
  await search.fill(keyword);
  await search.press("Enter");
}

test.describe.serial("WanMi 生产流程", () => {
  test("首页资产总览展示真实统计", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "域名资产总览" })).toBeVisible();
    // 亮卡主数字与三栏指标都来自 D1，不是硬编码
    await expect(page.locator(".hero-value strong")).toHaveText("859");
    const trio = page.locator(".stat-cell");
    await expect(trio.filter({ hasText: "全部域名" }).locator("strong")).toHaveText("859");
    await expect(trio.filter({ hasText: "精品域名" }).locator("strong")).toHaveText("87");
    await expect(trio.filter({ hasText: "后缀种类" }).locator("strong")).toHaveText("71");
    // 资产结构使用真实分布，不做时间趋势伪造
    await expect(page.locator(".structure-card").filter({ hasText: "后缀分布" })).toBeVisible();
    await expect(page.locator(".recent-item").first()).toBeVisible();
  });

  test("域名列表读取 D1、搜索和后缀筛选", async ({ page }) => {
    await page.goto("/domains", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("共 859 个域名")).toBeVisible();

    await searchDomains(page, "wanmi.org");
    await expect(page.getByTitle("复制 wanmi.org")).toBeVisible();

    await searchDomains(page, "02cloud.com");
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();

    await page.getByRole("button", { name: "清除筛选" }).click();
    await page.getByRole("button", { name: "纯数字 107", exact: true }).click();
    await expect(page.getByText("共 107 个域名")).toBeVisible();
    await expect(page.locator(".domain-card").first().getByText("纯数字", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "清除筛选" }).click();
    const orgOption = page.getByRole("option", { name: ".org", exact: true });
    await expect(orgOption).toBeAttached();
    await page.getByLabel("后缀筛选").selectOption("org");
    await expect(page.getByText(/共 154 个域名/)).toBeVisible();
  });

  test("旧版首页分享链接仍可用（重定向到域名列表）", async ({ page }) => {
    await page.goto("/?q=02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/domains\?q=02cloud\.com/);
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();
  });

  test("点击域名直接跳转到该域名本身，不再进入站内详情页", async ({ page }) => {
    await page.goto("/domains", { waitUntil: "domcontentloaded" });
    await searchDomains(page, "wanmi.org");

    const card = page.locator(".domain-card").first();
    const link = card.getByRole("link", { name: "打开 wanmi.org" });
    // 指向域名本身；外链必须新窗口打开且带 noopener，避免 window.opener 劫持
    await expect(link).toHaveAttribute("href", "https://wanmi.org");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);

    // 求购意向表单已整体移除
    await expect(page.getByText("提交求购意向")).toHaveCount(0);
  });

  test("旧的 /d/ 详情页链接回落到域名列表并预填搜索", async ({ page }) => {
    await page.goto("/d/02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/domains\?q=02cloud\.com/);
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();
  });

  test("管理员真实登录、隐藏与恢复域名、退出", async ({ page, context }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();

    const listedCard = page.locator(".admin-stat-grid > div").filter({ hasText: "前台展示" });
    await expect(listedCard.getByText("859", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /域名管理/ }).click();
    await page.getByPlaceholder("搜索完整域名").fill("02cloud.com");
    const record = page.locator(".record").filter({ hasText: "02cloud.com" });
    await expect(record).toBeVisible();

    // record 内两个开关：第 0 个是精品，第 1 个是前台展示
    await record.locator("button.switch").nth(1).click();
    await expect(page.getByText("已从前台隐藏")).toBeVisible();

    const publicPage = await context.newPage();
    await publicPage.goto("/domains?q=02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByText("没有匹配的域名")).toBeVisible();
    await publicPage.close();

    await record.locator("button.switch").nth(1).click();
    await expect(page.getByText("已恢复展示")).toBeVisible();
    const restoredPage = await context.newPage();
    await restoredPage.goto("/domains?q=02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(restoredPage.getByTitle("复制 02cloud.com")).toBeVisible();
    await restoredPage.close();

    await page.getByTitle("退出登录").click();
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  });

  test("简介与精品状态在前后台近实时同步并可恢复", async ({ page, context }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: /域名管理/ }).click();
    await page.getByPlaceholder("搜索完整域名").fill("02cloud.com");
    const record = page.locator(".record").filter({ hasText: "02cloud.com" });
    await expect(record).toBeVisible();

    // 编辑简介现在走应用内 Modal（原生 window.prompt 已移除）
    await record.getByRole("button", { name: /编辑 02cloud\.com 的简介/ }).click();
    const dialog = page.getByRole("dialog", { name: "编辑公开简介" });
    await dialog.getByRole("textbox").fill("E2E 临时简介");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("简介已保存")).toBeVisible();

    const featuredSwitch = record.locator("button.switch").first();
    const wasFeatured = (await featuredSwitch.getAttribute("class"))?.includes("on") ?? false;
    if (!wasFeatured) await featuredSwitch.click();

    const publicPage = await context.newPage();
    await publicPage.goto("/domains?q=02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByText("E2E 临时简介")).toBeVisible({ timeout: 10_000 });
    await expect(publicPage.locator(".domain-card.featured")).toBeVisible();
    await publicPage.reload({ waitUntil: "domcontentloaded" });
    await expect(publicPage.getByText("E2E 临时简介")).toBeVisible();

    // 清空简介并恢复原来的精品状态
    await record.getByRole("button", { name: /编辑 02cloud\.com 的简介/ }).click();
    const clearDialog = page.getByRole("dialog", { name: "编辑公开简介" });
    await clearDialog.getByRole("textbox").fill("");
    await clearDialog.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("简介已清空")).toBeVisible();
    if (!wasFeatured) await record.locator("button.switch").first().click();

    await expect.poll(async () => publicPage.locator(".domain-desc").count(), { timeout: 10_000 }).toBe(0);
    await publicPage.close();
  });

  test("手机端没有横向溢出且底部导航可用", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const path of ["/", "/domains"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll, `${path} 出现横向溢出`).toBeLessThanOrEqual(widths.client);
      // 手机端底部导航必须可见，且不能盖住正文
      await expect(page.locator(".bottom-nav")).toBeVisible();
    }
  });

  test("桌面端不出现手机底部导航", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/domains", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".bottom-nav")).toBeHidden();
    await expect(page.locator(".top-nav nav")).toBeVisible();
  });

  test("后台已移除 DNS / 注册商 / 线索三个模块", async ({ page }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();

    const nav = page.locator(".admin-sidebar nav button");
    await expect(nav).toHaveCount(7);
    for (const gone of ["DNS 解析", "注册商", "线索"]) {
      await expect(nav.filter({ hasText: gone })).toHaveCount(0);
    }
    // 到期提醒与通知渠道按要求保留
    await expect(nav.filter({ hasText: "到期提醒" })).toHaveCount(1);
  });
});
