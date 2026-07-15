# 安全设计

## 管理员密码

- 首次登录前从 `ADMIN_EMAIL` 与 `BOOTSTRAP_ADMIN_PASSWORD` Secret 引导管理员。
- 邮箱转小写；密码使用 Web Crypto PBKDF2-SHA-256、随机 16 字节盐和 Cloudflare Workers Web Crypto 支持上限 100,000 次迭代。
- D1 仅保存哈希、盐、算法和迭代次数。
- 管理员已存在时，部署不会重置密码。
- 改密会递增密码版本并撤销全部旧会话，再签发新会话。

## 会话、Cookie 与 CSRF

- 会话和 CSRF Token 均使用 32 字节随机数。
- D1 只保存用 `SESSION_SECRET` 计算的 HMAC-SHA-256 哈希。
- 生产 Cookie：HttpOnly（会话）、Secure、SameSite=Lax/Strict、Path=/、7 天有效期。
- 写请求同时验证 Origin、CSRF Cookie 和 `X-CSRF-Token`。
- 登录失败统一返回账号或密码错误；同一邮箱/IP 15 分钟 5 次失败后限流。
- 管理 API 返回 `Cache-Control: no-store`。

## 通知凭据

- 通知渠道密钥（Bark Device Key、各类 Webhook URL）使用 AES-256-GCM、随机 12 字节 IV 加密。
- 主密钥只来自 `CREDENTIALS_ENCRYPTION_KEY` Secret。
- Telegram、Resend 等 Token 只来自 Worker Secret。
- 日志不记录密码、完整 Token、API Key 或加密主密钥。
- 注册商 API 账户功能已移除，系统不再存储任何注册商凭据。

## 上传与公共数据

- R2 上传仅接受 PNG/JPEG/WebP/ICO，最大 2 MB；对象键由随机 UUID 生成并校验路径。
- 公共 API 仅返回域名 ID、完整域名、主体、TLD、分类、精品；价格只有管理员启用且单域审核后才返回。
- 管理员邮箱不会自动作为前台联系邮箱。
- 原始 CSV、市场内部字段、日志和备注不公开。

## Secret 轮换

1. 先备份 D1。
2. 改管理员密码并撤销其他会话。
3. 轮换 `SESSION_SECRET` 会使全部当前会话失效。
4. 轮换 `CREDENTIALS_ENCRYPTION_KEY` 前必须先用旧密钥解密并重新加密所有凭据；不能直接覆盖。
5. 首次管理员初始化确认后删除 `BOOTSTRAP_ADMIN_PASSWORD`。

## 构建和仓库保护

`.dev.vars*`、`.env*`、`.wrangler/` 和 `dist/` 被忽略。构建后脚本会删除预览 Secret 文件并扫描产物。`verify:no-demo-data` 扫描生产源码、脚本、migration、公共资源、构建产物和可选 D1 数据。
