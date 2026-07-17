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
  test.beforeEach(async ({ page }) => {
    await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
    await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  });

  test("精品详情页、OG、sitemap 与速览入口形成完整公开链路", async ({ page, request }) => {
    await page.goto("/d/mx.ooo", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/mx\.ooo · .+精选域名/);
    await expect(page.getByRole("heading", { name: "mx.ooo", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "访问该域名 →" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "相似域名推荐" })).toBeVisible();
    const seo = await page.evaluate(() => ({
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      product: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((element) => JSON.parse(element.textContent ?? "{}") as { "@type"?: string })
        .find((schema) => schema["@type"] === "Product"),
    }));
    expect(seo.ogImage).toContain("/api/public/og/mx.ooo");
    expect(seo.product).toMatchObject({ "@type": "Product", name: "mx.ooo" });

    const ordinary = await request.get("/d/nonfeatured.com", { maxRedirects: 0 });
    expect(ordinary.status()).toBe(301);
    expect(ordinary.headers().location).toContain("/domains?q=nonfeatured.com");

    const og = await request.get("/api/public/og/mx.ooo");
    const png = Buffer.from(await og.body());
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toBe("image/png");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);

    const sitemap = await request.get("/sitemap.xml");
    const xml = await sitemap.text();
    expect([...xml.matchAll(/<loc>/g)]).toHaveLength(88);
    expect(xml).toContain("/d/mx.ooo</loc>");

    await page.goto("/?q=mx.ooo", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "速览 mx.ooo" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "查看详情页 →" })).toHaveAttribute("href", "/d/mx.ooo");
  });

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
    // 收藏功能已在 3dfa368 移除，卡片只剩复制与速览两枚图标
    const actionButtons = resultCard.locator(".domain-actions button");
    await expect(actionButtons).toHaveCount(2);
    expect(await actionButtons.allInnerTexts()).toEqual(["", ""]);
    await expect(page.getByText("我想要", { exact: true })).toHaveCount(0);
    await search.fill("02cloud.com");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();
    await page.getByRole("button", { name: "清除筛选" }).click();
    const orgOption = page.getByRole("option", { name: ".org", exact: true });
    await expect(orgOption).toBeAttached();
    await page.getByLabel("后缀筛选").selectOption("org");
    await expect(page.getByText(/共 154 个域名/)).toBeVisible();
    await expect(page.getByLabel("排序方式").locator("option")).toHaveCount(6);
    expect(await page.getByLabel("排序方式").locator("option").allInnerTexts()).toEqual([
      "默认", "最新加入", "字符数升序", "字符数降序", "后缀字母序", "随机",
    ]);
    await page.getByLabel("排序方式").selectOption("length_desc");
    await expect(page).toHaveURL(/sort=length_desc/);
  });

  test("前台搜索历史、空结果推荐与筛选链接可以完整复用", async ({ page, context }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("wanmi-search-history", JSON.stringify({
        version: 1,
        items: ["wanmi.org", "02cloud.com", "mx.ooo", "aa.am", "ai.cat", "extra.example"],
      }));
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const search = page.getByRole("textbox", { name: "搜索域名" });
    await search.focus();
    const history = page.locator(".search-history");
    await expect(history.locator(":scope > div")).toHaveCount(5);
    await history.getByRole("button", { name: "wanmi.org", exact: true }).click();
    await expect(page).toHaveURL(/q=wanmi\.org/);
    await expect(page.getByTitle("复制 wanmi.org")).toBeVisible();

    await search.fill("definitely-no-such-wanmi-domain");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByRole("heading", { name: "未找到匹配的域名" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "试试这些精选域名" })).toBeVisible();
    await expect(page.locator(".empty-recommendations .domain-card")).toHaveCount(3);
    // 精品标记在 5fde067 从 domain-featured-dot 圆点改为 domain-featured-badge 星形徽标
    await expect(page.locator(".empty-recommendations .domain-featured-badge")).toHaveCount(3);

    await page.locator(".empty-results").getByRole("button", { name: "清除筛选" }).click();
    await expect(page).toHaveURL(/sort=default/);
    await expect(page.locator(".domain-card:not(.skeleton)")).toHaveCount(36);

    await search.focus();
    await page.getByRole("button", { name: "清除搜索历史" }).click();
    await expect(page.locator(".search-history")).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("wanmi-search-history"))).toBe('{"version":1,"items":[]}');
  });

  test("前台位数筛选、搜索历史与域名速览", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // 高级筛选面板已移除；位数下拉驱动同一 minLength/maxLength 状态
    await page.getByLabel("位数筛选").selectOption("7");
    await expect(page).toHaveURL(/minLength=7/);
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "高级筛选" })).toHaveCount(0);

    const search = page.getByRole("textbox", { name: "搜索域名" });
    await search.fill("02cloud.com");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "速览 02cloud.com" }).click();
    const dialog = page.getByRole("dialog", { name: /02cloud\.com/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("完整域名")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "域名价值维度" })).toBeVisible();
    await expect(dialog.getByText("字母数字", { exact: true })).toBeVisible();
    await expect(dialog.getByText("热门", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("img", { name: "02cloud.com 访问二维码" })).toHaveAttribute("width", "128");
    await expect(dialog.getByRole("link", { name: "下载 PNG" })).toHaveAttribute("download", "02cloud.com-qrcode.png");
    for (const label of ["WHOIS 查询", "历史存档", "后缀信息"]) {
      const link = dialog.getByRole("link", { name: label });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    await dialog.getByRole("button", { name: "关闭域名速览" }).click();

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
    expect((await adminNavigation.getByRole("button").allInnerTexts()).slice(0, 2)).toEqual(["概览", "域名管理"]);
    await expect(adminNavigation).not.toContainText("AI 配置");
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
    await expect(publicPage.getByText("未找到匹配的域名")).toBeVisible();
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
    await expect(preview.getByText("已存在", { exact: true })).toBeVisible();
    await expect(preview.getByText("字段冲突", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "关闭导入预览" }).click();

    await page.locator(".sidebar-user > summary").click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  });

  test("域名管理虚拟滚动、批量弹窗与日志趋势可用且无横向溢出", async ({ page }) => {
    const credentials = localCredentials();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.getByLabel("管理员邮箱").fill(credentials.email);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: /域名管理/ }).click();

    // 首屏按 100 条累积，桌面下开启虚拟化
    await expect(page.getByText(/已加载 100 \/ \d+ 个/)).toBeVisible();
    await expect(page.locator("table.domains-table.is-virtualized")).toBeVisible();
    // 虚拟化的意义：真实渲染的行数必须远少于已加载条数
    const renderedRows = page.locator("tr[data-virtual-row]");
    expect(await renderedRows.count()).toBeLessThan(60);

    // 滚到底触发无限滚动，继续累积下一页
    await page.locator(".infinite-sentinel").scrollIntoViewIfNeeded();
    await expect(page.getByText(/已加载 200 \/ \d+ 个/)).toBeVisible();
    expect(await renderedRows.count()).toBeLessThan(60);

    // 批量操作确认弹窗显示选中数量与即将执行的动作
    await page.mouse.wheel(0, -40000);
    await renderedRows.first().locator('input[type="checkbox"]').check();
    await expect(page.getByText("已选 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "设为精品", exact: true }).click();
    const confirmDialog = page.getByRole("dialog", { name: "设为精品" });
    await expect(confirmDialog.getByText("选中域名", { exact: true })).toBeVisible();
    await expect(confirmDialog.getByRole("button", { name: "确认设为精品 1 个" })).toBeVisible();
    await confirmDialog.getByRole("button", { name: "取消" }).click();

    // 批量分类改为弹窗选择，不再是 window.prompt
    await page.getByRole("button", { name: "设置分类", exact: true }).click();
    const categoryDialog = page.getByRole("dialog", { name: "批量设置分类" });
    await expect(categoryDialog.getByLabel("选择分类")).toBeVisible();
    await categoryDialog.getByRole("button", { name: "关闭批量分类" }).click();
    await page.getByRole("button", { name: "清空选择" }).click();

    // 操作日志 7 天趋势图与分组计数
    await page.getByRole("button", { name: /操作日志/ }).click();
    await expect(page.locator(".log-trend")).toBeVisible();
    await expect(page.getByText("近 7 天操作")).toBeVisible();
    await expect(page.locator(".log-trend-groups").getByText("批量", { exact: true })).toBeVisible();
    await expect(page.locator(".log-trend-chart svg").first()).toBeVisible();

    // 768 与 390px 下页面本身不得横向滚动（宽表格只在自身容器内滚动）
    await page.getByRole("button", { name: /域名管理/ }).click();
    await expect(page.getByText(/已加载 \d+ \/ \d+ 个/)).toBeVisible();
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBeLessThanOrEqual(0);
    }
  });

  test("手动简介与精品状态在刷新后同步并可恢复", async ({ page, context }) => {
    const credentials = localCredentials();
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
    // AI 生成已移除，简介仅手动维护
    await expect(editDialog.getByRole("button", { name: "AI 生成简介" })).toHaveCount(0);
    await editDialog.getByLabel(/^简介/).fill("E2E 手动简介");
    await editDialog.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("02cloud.com 已更新")).toBeVisible();
    const featuredSwitch = row.locator("button.switch").first();
    const wasFeatured = (await featuredSwitch.getAttribute("class"))?.includes("on") ?? false;
    if (!wasFeatured) await featuredSwitch.click();

    const publicPage = await context.newPage();
    await publicPage.goto("/?q=02cloud.com", { waitUntil: "domcontentloaded" });
    const publicDomainCard = publicPage.locator(".domain-list .domain-card").filter({ hasText: "02cloud.com" });
    await expect(publicDomainCard).toHaveClass(/featured/);
    await publicPage.getByRole("button", { name: "速览 02cloud.com" }).click();
    const quickView = publicPage.getByRole("dialog", { name: /02cloud\.com/ });
    await expect(quickView.getByText("E2E 手动简介", { exact: true })).toBeVisible();
    await quickView.getByRole("button", { name: "关闭域名速览" }).click();

    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await editDialog.getByLabel(/^简介/).fill("");
    await editDialog.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("02cloud.com 已更新")).toBeVisible();
    if (!wasFeatured) await row.locator("button.switch").first().click();
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

    // 「随机发现」已在 cc742dd 移除；改用首张卡片的速览验证手机端对话框可用
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(".domain-actions button[aria-label^='速览']").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "关闭域名速览" }).click();
  });
});
