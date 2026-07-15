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

test.describe.serial("WanMi 生产流程", () => {
  test("前台读取 D1、搜索和后缀筛选", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("共 859 个域名")).toBeVisible();
    await expect(page.locator(".domain-card:not(.skeleton)")).toHaveCount(36);
    const searchGeometry = await page.evaluate(() => {
      const form = document.querySelector(".filter-search")!.getBoundingClientRect();
      const button = document.querySelector(".search-submit")!.getBoundingClientRect();
      return { width: Math.round(button.width), rightGap: Math.round(form.right - button.right) };
    });
    expect(searchGeometry.width).toBeLessThanOrEqual(80);
    expect(searchGeometry.rightGap).toBeLessThanOrEqual(1);
    const search = page.getByRole("combobox", { name: "搜索域名" });
    await search.fill("wanmi.org");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByTitle("复制 wanmi.org")).toBeVisible();
    const resultCard = page.locator(".domain-card:not(.skeleton)");
    await expect(resultCard).toHaveCount(1);
    const actionButtons = resultCard.locator(".domain-actions button");
    await expect(actionButtons).toHaveCount(3);
    expect(await actionButtons.allInnerTexts()).toEqual(["", "", ""]);
    await expect(page.getByText("我想要", { exact: true })).toHaveCount(0);
    await search.fill("02cloud.com");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();
    await page.getByRole("button", { name: "清除筛选" }).click();
    const orgOption = page.getByRole("option", { name: ".org", exact: true });
    await expect(orgOption).toBeAttached();
    await page.getByLabel("后缀筛选").selectOption("org");
    await expect(page.getByText(/共 154 个域名/)).toBeVisible();
  });

  test("前台高级筛选、搜索历史、收藏与域名速览", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /高级筛选/ }).click();
    await page.getByLabel("必须包含").fill("cloud");
    await page.getByLabel("域名类型").selectOption("alphanumeric");
    await page.getByRole("button", { name: "应用筛选" }).click();
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();

    const search = page.getByRole("combobox", { name: "搜索域名" });
    await search.fill("02cloud.com");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "收藏 02cloud.com" }).click();
    await expect(page.getByText("已收藏 02cloud.com")).toBeVisible();
    await page.getByRole("button", { name: "速览 02cloud.com" }).click();
    const dialog = page.getByRole("dialog", { name: /02cloud\.com/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("完整域名")).toBeVisible();
    await dialog.getByRole("button", { name: "关闭域名速览" }).click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".public-header").getByRole("button", { name: /收藏 1/ }).click();
    await expect(page.getByRole("button", { name: "取消收藏 02cloud.com" })).toBeVisible();
    await page.getByRole("button", { name: "取消收藏 02cloud.com" }).click();
    await expect(page.getByText("还没有收藏")).toBeVisible();

    await page.getByRole("button", { name: "浏览全部域名" }).click();
    await page.getByRole("button", { name: "清空搜索" }).click();
    await search.focus();
    // 搜索建议面板的“最近搜索”分段应包含上次搜索词
    await expect(page.locator(".search-suggest").getByText("02cloud.com", { exact: true })).toBeVisible();
  });

  test("管理员真实登录、隐藏与恢复域名、退出", async ({ page, context }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();
    const adminNavigation = page.locator(".admin-sidebar nav");
    await expect(adminNavigation).not.toContainText("求购");
    await expect(adminNavigation).not.toContainText("线索");
    await expect(adminNavigation).not.toContainText("DNS");
    await expect(adminNavigation).not.toContainText("注册商");
    const listedCard = page.locator(".stat-card").filter({ hasText: "前台展示" });
    await expect(listedCard.getByText("859", { exact: true })).toBeVisible();
    // 数据看板新增图表：精品占比 / 字符长度分布 / 分类分布 / 到期分布
    await expect(page.getByRole("heading", { name: "精品占比", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "字符长度分布", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "到期分布", exact: true })).toBeVisible();
    await expect(page.locator(".expiry-bucket")).toHaveCount(5);
    await expect(page.locator(".ratio-donut svg")).toBeVisible();

    await page.getByRole("button", { name: /域名管理/ }).click();
    await page.getByPlaceholder("搜索完整域名").fill("02cloud.com");
    const row = page.getByRole("row").filter({ hasText: "02cloud.com" });
    await expect(row).toBeVisible();
    await row.locator("button.switch").nth(1).click();
    await expect(page.getByText("已从前台隐藏")).toBeVisible();

    const publicPage = await context.newPage();
    await publicPage.goto("/?q=02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByText("没有匹配的域名")).toBeVisible();
    await publicPage.close();

    await row.locator("button.switch").nth(1).click();
    await expect(page.getByText("已恢复展示")).toBeVisible();
    const restoredPage = await context.newPage();
    await restoredPage.goto("/?q=02cloud.com", { waitUntil: "domcontentloaded" });
    await expect(restoredPage.getByTitle("复制 02cloud.com")).toBeVisible();
    await restoredPage.close();

    await row.locator('input[type="checkbox"]').check();
    await expect(page.getByText("已选 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "清空选择" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "preview.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Domain,TLD\n02cloud.com,com\ncodexwanmi.com,com\n"),
    });
    const preview = page.getByRole("dialog", { name: /确认导入 preview\.csv/ });
    await expect(preview).toBeVisible();
    await expect(preview.getByText("跳过现有记录（默认）")).toBeVisible();
    await expect(preview.getByText("已存在 / 冲突")).toBeVisible();
    await preview.getByRole("button", { name: "关闭导入预览" }).click();

    await page.locator(".sidebar-user > summary").click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  });

  test("简介与精品状态在刷新后同步并可恢复", async ({ page, context }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: /域名管理/ }).click();
    await page.getByPlaceholder("搜索完整域名").fill("02cloud.com");
    const row = page.getByRole("row").filter({ hasText: "02cloud.com" });
    await expect(row).toBeVisible();
    page.once("dialog", async (dialog) => dialog.accept("E2E 临时简介"));
    await row.getByRole("button", { name: "编辑简介" }).click();
    await expect(page.getByText("简介已保存")).toBeVisible();
    const featuredSwitch = row.locator("button.switch").first();
    const wasFeatured = (await featuredSwitch.getAttribute("class"))?.includes("on") ?? false;
    if (!wasFeatured) await featuredSwitch.click();

    const publicPage = await context.newPage();
    await publicPage.goto("/?q=02cloud.com", { waitUntil: "domcontentloaded" });
    const publicDomainCard = publicPage.locator(".domain-list .domain-card").filter({ hasText: "02cloud.com" });
    await expect(publicDomainCard.getByText("E2E 临时简介", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(publicDomainCard).toHaveClass(/featured/);
    await publicPage.reload({ waitUntil: "domcontentloaded" });
    await expect(publicDomainCard.getByText("E2E 临时简介", { exact: true })).toBeVisible();

    page.once("dialog", async (dialog) => dialog.accept(""));
    await row.getByRole("button", { name: "编辑简介" }).click();
    await expect(page.getByText("简介已清空")).toBeVisible();
    if (!wasFeatured) await row.locator("button.switch").first().click();
    await publicPage.reload({ waitUntil: "domcontentloaded" });
    await expect(publicPage.locator(".domain-description")).toHaveText("简介待补充");
    await publicPage.close();
  });

  test("指定桌面、平板和手机尺寸均无横向溢出", async ({ page }) => {
    const viewports = [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 320, height: 568 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("共 859 个域名")).toBeVisible();
      const mobileNav = page.getByRole("navigation", { name: "移动端快捷导航" });
      if (viewport.width <= 780) await expect(mobileNav).toBeVisible();
      else await expect(mobileNav).toBeHidden();
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(widths.scroll, `${viewport.width}x${viewport.height} 不应横向溢出`).toBeLessThanOrEqual(widths.client);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "随机" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "关闭域名速览" }).click();
  });
});
