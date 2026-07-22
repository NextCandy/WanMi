import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 构建标识，进入边缘缓存键。
 *
 * 缓存键原先只带 public_data_version（数据改动时由触发器自增），代码部署不会
 * 让它变化——于是改了排序、序列化这类纯代码逻辑后，边缘上仍会命中旧响应，
 * 直到 s-maxage 到期。CI 里用提交 SHA，本地用启动时间戳。
 */
const buildId = process.env.GITHUB_SHA?.slice(0, 12) ?? `dev-${Date.now().toString(36)}`;

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), cloudflare({ remoteBindings: false })],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  build: {
    sourcemap: true,
  },
});
