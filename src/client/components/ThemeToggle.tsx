import { useEffect, useState } from "react";

function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(currentTheme);

  useEffect(() => {
    // 未显式选择时跟随系统变化
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem("wanmi-theme")) return;
      const next = event.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("wanmi-theme", next);
    document.cookie = `wanmi_theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setTheme(next);
  }

  return (
    <button className="theme-toggle" onClick={toggle} title={theme === "dark" ? "切换到浅色" : "切换到深色"} aria-label="切换深浅色主题">
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
