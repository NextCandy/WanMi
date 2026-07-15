import "@vitejs/plugin-react/preamble";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA：仅在生产环境注册 Service Worker，避免干扰开发时的 Vite HMR。
// 缓存策略见 public/sw.js（HTML/API 网络优先、静态资源 SWR、离线可打开基础外壳）。
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败（如不支持或被策略禁用）不影响应用正常运行
    });
  });
}
