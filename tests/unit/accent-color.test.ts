import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { THEME_BRAND_HEX, applyAccentColor } from "../../src/client/lib/accent-color";

/* node 环境无 DOM：以最小 stub 模拟 documentElement.style 的自定义属性读写 */
function createStyleStub() {
  const store = new Map<string, string>();
  return {
    store,
    setProperty: (key: string, value: string) => void store.set(key, value),
    removeProperty: (key: string) => void store.delete(key),
  };
}

describe("applyAccentColor", () => {
  let style: ReturnType<typeof createStyleStub>;

  beforeEach(() => {
    style = createStyleStub();
    (globalThis as Record<string, unknown>).document = { documentElement: { style } };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
  });

  it("当前主题默认色视为未定制，清除全部覆盖", () => {
    style.store.set("--brand", "#000000");
    applyAccentColor(THEME_BRAND_HEX);
    expect(style.store.size).toBe(0);
  });

  it("历史各轮默认色（黑金/暖金/珊瑚橙）同样视为未定制", () => {
    for (const legacy of ["#d8b638", "#c4a242", "#b89530", "#f97316", "#e85d2a"]) {
      style.store.set("--brand", "#000000");
      applyAccentColor(legacy);
      expect(style.store.size, `${legacy} 应清除覆盖`).toBe(0);
    }
  });

  it("非法值不覆盖任何属性", () => {
    applyAccentColor("red");
    applyAccentColor("#12345");
    applyAccentColor(null);
    expect(style.store.size).toBe(0);
  });

  it("自定义色整套派生：主色/strong/hover/bg/bg-strong/border/ring 同步", () => {
    applyAccentColor("#3b5bdb");
    expect(style.store.get("--brand")).toBe("#3b5bdb");
    for (const property of ["--brand-strong", "--brand-hover", "--brand-bg", "--brand-bg-strong", "--brand-border", "--brand-ring"]) {
      const value = style.store.get(property);
      expect(value, `${property} 必须派生`).toBeTruthy();
      expect(value).toContain("#3b5bdb");
      expect(value).toContain("color-mix");
    }
  });

  it("大小写与空白归一化后仍识别默认色", () => {
    applyAccentColor("  #133429  ".toUpperCase().trim());
    expect(style.store.size).toBe(0);
  });
});
