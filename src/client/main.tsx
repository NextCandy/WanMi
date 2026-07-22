import "@vitejs/plugin-react/preamble";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/fonts.css";
import "./styles/brand-fonts.css";
import "./styles/app.css";

// Safari 等浏览器可能通过前进/后退缓存恢复完整旧 DOM；恢复时强制重新请求当前 HTML。
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
