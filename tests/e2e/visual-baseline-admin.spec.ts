import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** 后台样式的回归基线：拆分 admin.css 时用来发现层叠破坏 */
const WIDTHS = [390, 1024, 1440];

function localCredentials(): { email: string; password: string } {
  if (process.env.ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    return { email: process.env.ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD };
  }
  if (!fs.existsSync(".dev.vars")) throw new Error("缺少 E2E 管理员凭据：请设置环境变量或创建 .dev.vars");
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

async function login(page: Page): Promise<void> {
  const { email, password } = localCredentials();
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.getByLabel("管理员邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();
}

test.describe("后台视觉基线", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
    await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  });

  for (const width of WIDTHS) {
    test(`admin-overview @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await page.locator(".stat-card").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      // 概览页有三处真实动态数据，遮盖内容但保留布局检测：
      // .stats-overview 今日 PV/UV 每次访问都增长（AdminApp.tsx:140）
      // .admin-two-columns 访客地区 visitors 与域名点击 clicks/相对时间同样随访问变化（AdminApp.tsx:141）
      // .activity-list 用 formatRelative 渲染相对时间，且每次登录都新增一条日志（AdminApp.tsx:145）
      await expect(page).toHaveScreenshot(`admin-overview-${width}.png`, {
        fullPage: true,
        animations: "disabled",
        mask: [
          page.locator(".stats-overview"),
          page.locator(".admin-two-columns"),
          page.locator(".activity-list"),
        ],
      });
    });

    test(`admin-domains @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await page.getByRole("button", { name: /域名管理/ }).click();
      await page.locator(".domains-table").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      // 桌面端域名表按视口虚拟化渲染（useVirtualRows），滚动后行高才实测稳定
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let previous = -1;
          const step = () => {
            window.scrollBy(0, window.innerHeight);
            if (window.scrollY === previous) {
              resolve();
              return;
            }
            previous = window.scrollY;
            requestAnimationFrame(step);
          };
          step();
        });
        window.scrollTo(0, 0);
      });
      await expect(page).toHaveScreenshot(`admin-domains-${width}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });
  }
});
