import { expect, test } from "@playwright/test";

/** design.md「Responsive」要求验证的 8 个宽度 */
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440, 1920];

/** ready 选择器用于确认数据已渲染，避免截到骨架屏 */
const TARGETS = [
  { name: "home", path: "/", ready: ".domain-card" },
  { name: "featured-detail", path: "/d/mx.ooo", ready: "h1" },
] as const;

// 截图基线按 平台+浏览器 绑定（*-chromium-win32.png），Linux CI 的字体渲染逐像素不同，
// 永远无法与 Windows 基线比对。基线定位为本地 CSS 改动的回归网；CI 由功能性 E2E 覆盖。
test.skip(!!process.env.CI, "视觉基线仅在本地（win32）运行");

test.describe("视觉基线", () => {
  test.beforeEach(async ({ page }) => {
    // reduce 下产品自身会走无动画退化分支（Hero 与其计数动画已删，保留此设置
    // 以稳定余下的 CSS 过渡与将来新增动画的截图）。
    await page.emulateMedia({ reducedMotion: "reduce" });
    // 与 wanmi.spec.ts 保持一致：不依赖外网字体，否则截图随网络波动
    await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
    await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
    // 首页精选区用 Math.random 洗牌（PublicPage.tsx:156），不固定住则每次截图都不同
    await page.addInitScript(() => {
      let seed = 1;
      Math.random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
    });
  });

  for (const width of WIDTHS) {
    for (const target of TARGETS) {
      test(`${target.name} @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(target.path, { waitUntil: "networkidle" });
        await page.locator(target.ready).first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        // 卡片用 content-visibility（README 性能策略），屏幕外内容按 contain-intrinsic-size
        // 估算高度；fullPage 截图滚动时才渲染成真实高度，导致页面总高在两次运行间抖动。
        // 逐屏滚动触发真实渲染后，还要等 scrollHeight 收敛（渲染是异步的，
        // 快速滚过时部分卡片仍按估算高度参与布局），两次读数一致才算稳定。
        await page.evaluate(async () => {
          const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          let stable = 0;
          for (let pass = 0; pass < 12 && stable < 2; pass += 1) {
            const before = document.documentElement.scrollHeight;
            for (let y = 0; y <= before; y += window.innerHeight) {
              window.scrollTo(0, y);
              await wait(40);
            }
            window.scrollTo(0, document.documentElement.scrollHeight);
            await wait(200);
            stable = document.documentElement.scrollHeight === before ? stable + 1 : 0;
          }
          window.scrollTo(0, 0);
          await wait(160);
        });
        await expect(page).toHaveScreenshot(`${target.name}-${width}.png`, {
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  }
});
