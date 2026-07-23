import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "unusedomain-theme";
const THEME_COLOR = { light: "#f6f5f0", dark: "#12201b" } as const;

/** 读 <html data-theme>，它由 index.html 的同步脚本在首帧前写好，因此不会与首屏不一致 */
function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * 主题状态。初值直接取自 DOM 而非 localStorage：index.html 的内联脚本已经解析过
 * 「存储偏好 → 系统偏好」并落到 data-theme，这里再解析一遍只会多一个分歧来源。
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // 用户没有显式选过时跟随系统实时变化；选过之后系统再变也不夺走控制权
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next: Theme = event.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      setTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => { query.removeEventListener("change", onChange); };
  }, []);

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // 隐私模式下写不进去；本次会话仍然生效，只是不持久
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
