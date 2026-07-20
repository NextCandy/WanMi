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
    await page.getByRole("button", { name: "查看 mx.ooo" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "查看详情页 →" })).toHaveAttribute("href", "/d/mx.ooo");
  });

  test("前台读取 D1、搜索和分类、后缀筛选", async ({ page }) => {
    await page.route("**/api/public/settings", async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { data: Record<string, unknown> };
      await route.fulfill({ response, json: { ...body, data: { ...body.data, contact_email: "955555@gmail.com", contact_x: "iWangGang", contact_qq: "307203" } } });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("WanMi · 域名展示");
    await expect(page.locator('meta[name="wanmi-build"]')).toHaveAttribute("content", "elegant-green-gold-2026-07-20-v4");
    await expect(page.locator(".domain-total-pill")).toHaveText("859 个域名");
    await expect(page.locator(".public-header .brand-title")).toHaveText("WanMi");
    await expect(page.locator(".public-header .brand-title")).toBeVisible();
    await expect(page.getByRole("heading", { name: "WanMi", exact: true })).toHaveCount(1);
    await expect(page.locator(".brand-statement, .hero-stats")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "状态筛选" })).toHaveCount(0);
    await expect(page.getByText("DOMAIN ASSET GALLERY", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/为你的下一个项目找到合适的域名/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "后台" })).toHaveText("");
    await expect(page.getByRole("link", { name: "后台" }).locator("svg")).toHaveCount(1);
    expect(await page.locator(".toolbar-filters option:checked").allInnerTexts()).toEqual(["分类", "后缀", "位数", "排序"]);
    await expect(page.locator(".domain-card:not(.skeleton)")).toHaveCount(36);
    await expect(page.locator(".view-switch")).toHaveCount(0);
    await expect(page.locator(".domain-list.card-view")).toBeVisible();
    await expect(page.locator(".domain-list.compact-view")).toHaveCount(0);
    /* 首卡因排序打分随库数据浮动，且首屏卡未必有注册日期：
       这里只断言两种合法形态；完整日期区间格式由 mx.ooo 链路用例守护。 */
    const firstCatalogueCard = page.locator(".domain-card:not(.skeleton)").first();
    await expect(firstCatalogueCard.locator(".registration-range")).toHaveText(/^(\d{4}\.\d{2}\.\d{2}-\d{4}\.\d{2}\.\d{2}|\d{4}\.\d{2}\.\d{2}|日期待补充)$/);
    await expect(firstCatalogueCard.locator(".remaining-days")).toHaveText(/^(余\d+天|已过期\d+天|有效期未知)$/);
    const cardGeometry = await firstCatalogueCard.evaluate((card) => {
      const rect = (selector: string) => card.querySelector(selector)!.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const badges = rect(".card-badge-row");
      const actions = rect(".domain-actions");
      const name = rect(".domain-name");
      const description = rect(".domain-description");
      const dates = rect(".card-expiry-row");
      const range = rect(".registration-range");
      const remaining = rect(".remaining-days");
      return {
        actionsAtTopRight: actions.top >= badges.top - 1 && actions.right > cardRect.left + cardRect.width / 2 && cardRect.right - actions.right <= 20,
        contentOrder: badges.top < name.top && name.top < description.top && description.top < dates.top,
        remainingAtBottomRight: remaining.right > range.right && cardRect.right - remaining.right <= 20,
      };
    });
    expect(cardGeometry).toEqual({ actionsAtTopRight: true, contentOrder: true, remainingAtBottomRight: true });
    const badgeGeometry = await page.evaluate(() => {
      const firstCard = document.querySelector(".domain-card:not(.skeleton)")!;
      const tld = firstCard.querySelector(".tld-badge")!.getBoundingClientRect();
      const categoryElement = firstCard.querySelector<HTMLElement>(".category-badge")!;
      const category = categoryElement.getBoundingClientRect();
      const actions = firstCard.querySelector(".domain-actions")!.getBoundingClientRect();
      return {
        categoryWidth: category.width,
        categoryContentWidth: categoryElement.scrollWidth,
        tldWidth: tld.width,
        categoryLeavesFlexibleSpace: actions.left - category.right,
      };
    });
    expect(badgeGeometry.categoryWidth).toBeLessThan(120);
    expect(Math.abs(badgeGeometry.categoryWidth - badgeGeometry.categoryContentWidth)).toBeLessThanOrEqual(2);
    expect(badgeGeometry.tldWidth).toBeLessThan(90);
    expect(badgeGeometry.categoryLeavesFlexibleSpace).toBeGreaterThan(12);
    const badgeStyle = async () => page.locator(".tld-badge").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor, border: style.borderColor };
    });
    const comBadgeStyle = await badgeStyle();
    await page.getByLabel("后缀筛选").selectOption("cn");
    await expect(page.locator(".tld-badge").first()).toHaveText(".cn");
    expect(await badgeStyle()).toEqual(comBadgeStyle);
    await page.getByLabel("后缀筛选").selectOption("ooo");
    await expect(page.locator(".tld-badge").first()).toHaveText(".ooo");
    expect(await badgeStyle()).toEqual(comBadgeStyle);
    await page.getByLabel("后缀筛选").selectOption("");
    const searchGeometry = await page.evaluate(() => {
      const form = document.querySelector(".filter-search")!.getBoundingClientRect();
      const button = document.querySelector(".search-submit")!.getBoundingClientRect();
      return { width: Math.round(button.width), rightGap: Math.round(form.right - button.right) };
    });
    expect(searchGeometry.width).toBeLessThanOrEqual(80);
    expect(searchGeometry.rightGap).toBeLessThanOrEqual(1);
    const frameGeometry = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const logo = rect(".public-header .brand-icon");
      const title = rect(".public-header .brand-title");
      const total = rect(".domain-total-pill");
      const admin = rect(".public-header .admin-link");
      const search = rect(".filter-search");
      const category = rect(".toolbar-filters .category-control");
      const footer = rect(".public-footer");
      const contact = rect(".header-actions > .hero-contact-links");
      const contactLinks = [...document.querySelectorAll(".hero-contact-link")].map((element) => element.getBoundingClientRect());
      return {
        brandItemsCentered: Math.abs((logo.top + logo.bottom) / 2 - (title.top + title.bottom) / 2),
        headerOrder: total.left > title.right && contact.left > total.right && admin.left > contact.right,
        headerItemsCentered: [total, contact, admin].every((item) => Math.abs((item.top + item.bottom) / 2 - (logo.top + logo.bottom) / 2) <= 1),
        controlsShareTopEdge: Math.abs(search.top - category.top),
        controlsShareHeight: Math.abs(search.height - category.height),
        footerCenterGap: Math.abs((footer.left + footer.right) / 2 - document.documentElement.clientWidth / 2),
        contactHeight: contact.height,
        totalHeight: total.height,
        contactsAreHorizontal: contactLinks.every((link, index) => index === 0 || link.left > contactLinks[index - 1].left),
        contactsShareTopEdge: contactLinks.every((link) => Math.abs(link.top - contactLinks[0].top) <= 1),
        contactsHaveNoVisibleText: [...document.querySelectorAll(".hero-contact-link")].every((link) => !link.textContent?.trim()),
      };
    });
    expect(frameGeometry.brandItemsCentered).toBeLessThanOrEqual(1);
    expect(frameGeometry.headerOrder).toBe(true);
    expect(frameGeometry.headerItemsCentered).toBe(true);
    expect(frameGeometry.controlsShareTopEdge).toBeLessThanOrEqual(1);
    expect(frameGeometry.controlsShareHeight).toBeLessThanOrEqual(1);
    expect(frameGeometry.footerCenterGap).toBeLessThanOrEqual(1);
    expect(frameGeometry.contactHeight).toBeLessThanOrEqual(30);
    expect(frameGeometry.totalHeight).toBeLessThanOrEqual(32);
    expect(frameGeometry.contactsAreHorizontal).toBe(true);
    expect(frameGeometry.contactsShareTopEdge).toBe(true);
    expect(frameGeometry.contactsHaveNoVisibleText).toBe(true);
    await expect(page.locator(".hero-contact-link")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "发送邮件至 955555@gmail.com" })).toHaveAttribute("href", "mailto:955555@gmail.com");
    await expect(page.getByRole("link", { name: "在 X 联系 iWangGang" })).toHaveAttribute("href", "https://x.com/iWangGang");
    await expect(page.getByRole("link", { name: "通过 QQ 联系 307203" })).toHaveAttribute("href", "https://wpa.qq.com/msgrd?v=3&uin=307203&site=qq&menu=yes");
    await expect(page.locator(".public-footer .contact-icons-wrap")).toHaveCount(0);
    await expect(page.locator(".footer-logo")).toHaveAttribute("src", "/logo.svg");
    await expect(page.locator(".footer-copyright")).toHaveText("© WanMi · 玩米");
    const footerGeometry = await page.locator(".public-footer").evaluate((footer) => {
      const logo = footer.querySelector(".footer-logo")!.getBoundingClientRect();
      const content = footer.querySelector(".footer-copyright")!.getBoundingClientRect();
      return { footerHeight: footer.getBoundingClientRect().height, footerWidth: footer.getBoundingClientRect().width, logoHeight: logo.height, contentWidth: content.width };
    });
    expect(footerGeometry.footerHeight - footerGeometry.logoHeight).toBeLessThanOrEqual(12);
    expect(footerGeometry.footerWidth - footerGeometry.contentWidth).toBeLessThanOrEqual(20);
    const search = page.getByRole("textbox", { name: "搜索域名" });
    await search.fill("wanmi.org");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByTitle("复制 wanmi.org")).toBeVisible();
    const resultCard = page.locator(".domain-card:not(.skeleton)");
    await expect(resultCard).toHaveCount(1);
    // 卡片右上角只保留复制与查看两枚图标。
    const actionButtons = resultCard.locator(".domain-actions button");
    await expect(actionButtons).toHaveCount(2);
    expect(await actionButtons.allInnerTexts()).toEqual(["", ""]);
    await expect(page.getByText("我想要", { exact: true })).toHaveCount(0);
    await search.fill("02cloud.com");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByTitle("复制 02cloud.com")).toBeVisible();
    await page.getByRole("button", { name: "清除筛选" }).click();
    expect(await page.locator(".toolbar-filters option:checked").allInnerTexts()).toEqual(["分类", "后缀", "位数", "排序"]);
    await expect(page.getByLabel("分类筛选")).toBeVisible();
    const orgOption = page.getByRole("option", { name: ".org", exact: true });
    await expect(orgOption).toBeAttached();
    await page.getByLabel("后缀筛选").selectOption("org");
    await expect(page.locator(".tld-badge").first()).toHaveText(".org");
    await expect(page.locator(".domain-total-pill")).toHaveText("859 个域名");
    await expect(page.getByLabel("排序方式").locator("option")).toHaveCount(6);
    expect(await page.getByLabel("排序方式").locator("option").allInnerTexts()).toEqual([
      "排序", "最新加入", "字符数升序", "字符数降序", "后缀字母序", "随机",
    ]);
    await page.getByLabel("排序方式").selectOption("length_desc");
    await expect(page).toHaveURL(/sort=length_desc/);
  });

  test("手机端首屏直接显示筛选和紧凑域名列表", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".brand-statement")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "WanMi", level: 1 })).toHaveCount(1);
    await expect(page.locator(".public-header .brand-title")).toBeVisible();
    await expect(page.locator(".public-header .brand-icon")).toBeVisible();
    await expect(page.locator(".public-header .header-actions")).toBeHidden();
    await expect(page.getByRole("group", { name: "状态筛选" })).toHaveCount(0);
    await expect(page.locator(".view-switch")).toHaveCount(0);
    await expect(page.locator(".domain-list.compact-view")).toBeVisible();
    await expect(page.locator(".domain-list.card-view")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "移动端快捷导航" })).toHaveCount(0);
    await expect(page.locator(".footer-copyright")).toHaveText("© WanMi · 玩米");
    expect(await page.locator(".toolbar-filters option:checked").allInnerTexts()).toEqual(["分类", "后缀", "位数", "排序"]);
    const metrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      firstDomainTop: Math.round(document.querySelector(".domain-card:not(.skeleton)")!.getBoundingClientRect().top),
    }));
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.firstDomainTop).toBeLessThan(330);
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
    // 精品星标随分类保留在卡片左上，日期行只负责日期范围和剩余有效期。
    await expect(page.locator(".empty-recommendations .category-badge svg")).toHaveCount(3);

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
    await page.getByRole("button", { name: "查看 02cloud.com" }).click();
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
    await expect(page.locator(".admin-brand")).toContainText("WanMi");
    await expect(page.locator(".admin-header")).toContainText("WanMi 管理后台");
    await expect(page.getByRole("link", { name: "查看前台" })).toHaveText("");
    await expect(page.getByRole("link", { name: "查看前台" }).locator("svg")).toHaveCount(1);
    const adminNavigation = page.locator(".admin-sidebar nav");
    expect((await adminNavigation.getByRole("button").allInnerTexts()).slice(0, 2)).toEqual(["概览", "域名管理"]);
    await expect(adminNavigation).not.toContainText("AI 配置");
    await expect(adminNavigation).not.toContainText("求购");
    await expect(adminNavigation).not.toContainText("线索");
    await expect(adminNavigation).not.toContainText("DNS");
    await expect(adminNavigation).not.toContainText("注册商");
    // 概览统计卡按 Dark Vault 改版为：域名总数 / 即将到期 / 精品域名 / 已隐藏
    const totalCard = page.locator(".stat-card").filter({ hasText: "域名总数" });
    await expect(totalCard.getByText("859", { exact: true })).toBeVisible();
    await expect(page.locator(".stat-card").filter({ hasText: "即将到期" })).toBeVisible();
    await expect(page.locator(".quick-actions button").filter({ hasText: "导出 CSV" })).toBeVisible();

    await adminNavigation.getByRole("button", { name: "站点设置", exact: true }).click();
    await expect(page.getByLabel("站点名称")).toHaveValue("WanMi");
    await expect(page.getByLabel("站点 Slogan")).toHaveValue("精选域名资产展示");
    await expect(page.locator(".upload-card").nth(0).locator("img")).toHaveAttribute("src", "/logo.svg");
    await expect(page.locator(".upload-card").nth(1).locator("img")).toHaveAttribute("src", "/favicon.svg");
    await expect(page.getByLabel("版权文字")).toHaveValue("© WanMi · 玩米");
    await expect(page.getByText("页首显示管理入口", { exact: true })).toBeVisible();
    await expect(page.getByText("页脚显示管理入口", { exact: true })).toHaveCount(0);

    await adminNavigation.getByRole("button", { name: "账户安全", exact: true }).click();
    await expect(page.getByLabel("当前密码")).toBeVisible();
    await expect(page.getByLabel("新密码")).toBeVisible();
    await expect(page.getByText("双重验证（TOTP）", { exact: true })).toHaveCount(0);
    await expect(page.getByText("当前会话", { exact: true })).toHaveCount(0);

    await adminNavigation.getByRole("button", { name: /域名管理/ }).click();
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
    await publicPage.getByRole("button", { name: "查看 02cloud.com" }).click();
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
      await expect(page.locator(".domain-card:not(.skeleton)").first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "移动端快捷导航" })).toHaveCount(0);
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(widths.scroll, `${viewport.width}x${viewport.height} 不应横向溢出`).toBeLessThanOrEqual(widths.client);
    }

    // 「随机发现」已在 cc742dd 移除；改用首张卡片的速览验证手机端对话框可用
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(".domain-actions button[aria-label^='查看']").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "关闭域名速览" }).click();
  });
});
