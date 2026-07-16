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
    const search = page.getByRole("textbox", { name: "搜索域名" });
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

    const search = page.getByRole("textbox", { name: "搜索域名" });
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
    await expect(page.locator(".search-history").getByRole("button", { name: "02cloud.com", exact: true })).toBeVisible();
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

  test("站点设置可保存多个 AI 简介配置并通过应用内弹窗删除", async ({ page }) => {
    const credentials = localCredentials();
    const configName = `E2E 备用配置 ${Date.now()}`;
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: /站点设置/ }).click();
    await expect(page.getByRole("heading", { name: "AI 简介配置" })).toBeVisible();
    await expect(page.getByText("DeepSeek 默认配置", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "新增配置" }).click();
    const dialog = page.getByRole("dialog", { name: "新增 AI 配置" });
    await dialog.getByLabel("配置名称").fill(configName);
    await dialog.getByLabel("提供商").selectOption("openai_compatible");
    await dialog.getByLabel("接口地址").fill("https://ai.example.test/v1");
    await dialog.getByLabel("模型").fill("example-chat");
    await dialog.getByLabel("API Key").fill("sk-e2e-only-secret");
    await dialog.getByRole("button", { name: "保存配置" }).click();
    const card = page.locator(".ai-config-card").filter({ hasText: configName });
    await expect(card).toBeVisible();
    await expect(card.getByText("Key 已加密")).toBeVisible();
    await card.getByRole("button", { name: "删除" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "删除 AI 配置" });
    await expect(deleteDialog.getByText(configName, { exact: false })).toBeVisible();
    await deleteDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(card).toBeHidden();
  });

  test("批量关键词可应用到多个域名、清除并进入操作日志", async ({ page }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: /域名管理/ }).click();
    await page.getByPlaceholder("搜索完整域名").fill("cloud");
    const rows = page.locator(".admin-table tbody tr");
    await expect(rows.nth(0)).toBeVisible();
    await expect(rows.nth(1)).toBeVisible();
    await rows.nth(0).getByRole("checkbox").check();
    await rows.nth(1).getByRole("checkbox").check();
    await page.getByRole("button", { name: "批量设置关键词" }).click();
    const dialog = page.getByRole("dialog", { name: "批量设置关键词" });
    await dialog.getByRole("textbox", { name: /^关键词/ }).fill("批量，品牌、测试");
    await dialog.getByRole("button", { name: "应用到 2 个域名" }).click();
    await expect(dialog).toBeHidden();
    await expect(rows.nth(0).locator(".keywords-cell .keyword-pill")).toHaveText(["批量", "品牌", "测试"]);
    await expect(rows.nth(1).locator(".keywords-cell .keyword-pill")).toHaveText(["批量", "品牌", "测试"]);

    await rows.nth(0).getByRole("checkbox").check();
    await rows.nth(1).getByRole("checkbox").check();
    await page.getByRole("button", { name: "批量设置关键词" }).click();
    await page.getByRole("dialog", { name: "批量设置关键词" }).getByRole("button", { name: "应用到 2 个域名" }).click();
    await expect(rows.nth(0).locator(".keywords-cell .keyword-pill")).toHaveCount(0);
    await expect(rows.nth(1).locator(".keywords-cell .keyword-pill")).toHaveCount(0);

    await page.getByRole("button", { name: /操作日志/ }).click();
    await page.getByLabel("操作类型筛选").selectOption("domains.bulk.keywords");
    await expect(page.locator(".log-table").getByText("批量设置关键词", { exact: true }).first()).toBeVisible();
  });

  test("关键词、简介与精品状态在刷新后同步并可恢复", async ({ page, context }) => {
    const credentials = localCredentials();
    let aiShouldFail = false;
    await page.route("**/api/admin/domains/*/suggest-description", async (route) => {
      if (aiShouldFail) {
        await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ success: false, data: null, error: { code: "DESCRIPTION_SUGGESTION_FAILED", message: "简介生成失败，请手动填写" } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { description: "适合云服务与数字品牌场景，名称简洁易记，并具备清晰的科技属性与延展空间。", config: { id: "deepseek-default", name: "DeepSeek 默认配置", model: "deepseek-v4-flash" } }, error: null }) });
    });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: /域名管理/ }).click();
    await page.getByPlaceholder("搜索完整域名").fill("02cloud.com");
    const row = page.getByRole("row").filter({ hasText: "02cloud.com" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "编辑域名信息" });
    await editDialog.getByLabel(/^关键词/).fill("原始关键词");
    await editDialog.getByLabel("简介（可选）").fill("AI 生成前简介");
    await editDialog.getByRole("button", { name: "AI 生成简介" }).click();
    await expect(editDialog.getByLabel("简介（可选）")).toHaveValue(/适合云服务与数字品牌场景/);
    await expect(editDialog.getByLabel(/^关键词/)).toHaveValue("原始关键词");
    await expect(editDialog.getByText("DeepSeek 默认配置 已生成，请审核后保存")).toBeVisible();
    aiShouldFail = true;
    await editDialog.getByLabel("简介（可选）").fill("AI 失败不应改动此字段");
    await editDialog.getByRole("button", { name: "AI 生成简介" }).click();
    await expect(editDialog.getByText("简介生成失败，请手动填写")).toBeVisible();
    await expect(editDialog.getByLabel("简介（可选）")).toHaveValue("AI 失败不应改动此字段");
    await editDialog.getByLabel(/^关键词/).fill("云服务，品牌,未来、精选,第五");
    await editDialog.getByLabel("简介（可选）").fill("E2E 临时简介");
    await editDialog.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("02cloud.com 已更新")).toBeVisible();
    const featuredSwitch = row.locator("button.switch").first();
    const wasFeatured = (await featuredSwitch.getAttribute("class"))?.includes("on") ?? false;
    if (!wasFeatured) await featuredSwitch.click();

    const publicPage = await context.newPage();
    await publicPage.goto("/?q=02cloud.com", { waitUntil: "domcontentloaded" });
    const publicDomainCard = publicPage.locator(".domain-list .domain-card").filter({ hasText: "02cloud.com" });
    await expect(publicDomainCard.locator(".keyword-pill")).toHaveText(["云服务", "品牌", "未来", "精选", "+1"]);
    await expect(publicDomainCard.getByText("E2E 临时简介", { exact: true })).toHaveCount(0);
    await expect(publicDomainCard).toHaveClass(/featured/);
    await publicPage.getByRole("button", { name: "速览 02cloud.com" }).click();
    const quickView = publicPage.getByRole("dialog", { name: /02cloud\.com/ });
    await expect(quickView.locator(".keyword-pill")).toHaveText(["云服务", "品牌", "未来", "精选", "第五"]);
    await expect(quickView.getByText("E2E 临时简介", { exact: true })).toBeVisible();
    await quickView.getByRole("button", { name: "关闭域名速览" }).click();

    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await editDialog.getByLabel(/^关键词/).fill("");
    await editDialog.getByLabel("简介（可选）").fill("");
    await editDialog.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("02cloud.com 已更新")).toBeVisible();
    if (!wasFeatured) await row.locator("button.switch").first().click();
    await publicPage.reload({ waitUntil: "domcontentloaded" });
    await expect(publicDomainCard.locator(".domain-keywords")).toHaveCount(0);
    await expect(publicDomainCard.locator(".domain-description")).toHaveCount(0);
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
