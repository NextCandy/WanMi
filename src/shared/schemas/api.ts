import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12, "新密码至少 12 位").max(1024),
});

const calendarDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  }, "日期无效");

export const publicDomainQuerySchema = z.object({
  q: z.string().trim().max(253).optional(),
  tld: z.string().trim().max(253).optional(),
  length: z.coerce.number().int().min(1).max(253).optional(),
  minLength: z.coerce.number().int().min(1).max(253).optional(),
  maxLength: z.coerce.number().int().min(1).max(253).optional(),
  contains: z.string().trim().max(40).optional(),
  excludes: z.string().trim().max(20).optional(),
  category: z.string().trim().max(80).optional(),
  featured: z.enum(["true", "false"]).optional(),
  kind: z.enum(["digits", "letters", "alphanumeric", "hyphen"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(60),
  sort: z
    .enum(["default", "domain_asc", "domain_desc", "price_desc", "price_asc", "views_desc", "added_desc", "length_asc"])
    .default("default"),
});

export const adminDomainQuerySchema = publicDomainQuerySchema.extend({
  listed: z.enum(["true", "false"]).optional(),
  listingStatus: z.string().trim().max(120).optional(),
  fastTransfer: z.string().trim().max(120).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  registrar: z.string().trim().max(120).optional(),
  registeredFrom: calendarDateSchema.optional(),
  registeredTo: calendarDateSchema.optional(),
  expiresFrom: calendarDateSchema.optional(),
  expiresTo: calendarDateSchema.optional(),
  orderBy: z.enum(["domain", "registered_at", "expires_at", "registrar"]).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  ids: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  level: z.enum(["info", "warning", "error"]).optional(),
  action: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const domainInputSchema = z.object({
  fullDomain: z.string().trim().min(3).max(253),
  tld: z.string().trim().max(253).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  isFeatured: z.boolean().optional(),
  isListed: z.boolean().optional(),
  publicPrice: z.string().regex(/^\d+(?:\.\d+)?$/).nullable().optional(),
  publicPriceCurrency: z.string().trim().min(3).max(3).nullable().optional(),
  publicPriceApproved: z.boolean().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  description: z.string().max(500).optional(),
  registeredAt: calendarDateSchema.nullable().optional(),
  expiresAt: calendarDateSchema.nullable().optional(),
  registrarName: z.string().trim().max(120).nullable().optional(),
});

export const domainPatchSchema = domainInputSchema.partial();

export const bulkDomainSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(["delete", "feature", "unfeature", "list", "hide", "categorize", "price"]),
  category: z.string().trim().max(80).nullable().optional(),
  price: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .nullable()
    .optional(),
});

const booleanSettingSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => Boolean(value));

export const settingsPatchSchema = z
  .object({
    site_name: z.string().trim().min(1).max(80),
    site_description: z.string().trim().max(240),
    site_bio: z.string().trim().max(500).nullable(),
    accent_color: z.string().regex(/^#[0-9a-f]{6}$/i),
    display_density: z.enum(["compact", "comfortable", "spacious"]),
    featured_first: booleanSettingSchema,
    show_admin_link_in_footer: booleanSettingSchema,
    show_prices: booleanSettingSchema,
    copyright_text: z.string().trim().max(160).nullable(),
    icp_number: z.string().trim().max(80).nullable(),
    contact_email: z.union([z.string().trim().email(), z.literal("")]).nullable(),
    contact_wechat: z.string().trim().max(120).nullable(),
    contact_telegram: z.string().trim().max(120).nullable(),
    contact_whatsapp: z.string().trim().max(40).nullable(),
    contact_x: z.string().trim().max(200).nullable(),
    contact_xiaohongshu: z.union([z.string().trim().url(), z.literal("")]).nullable(),
    contact_qq: z.string().trim().max(32).nullable(),
    logo_url: z.string().trim().max(500).nullable(),
    favicon_url: z.string().trim().max(500).nullable(),
    wechat_qr_url: z.string().trim().max(500).nullable(),
  })
  .partial();

const webhookUrl = (hosts: string[]) =>
  z
    .string()
    .trim()
    .url()
    .max(1000)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && hosts.some((host) => url.hostname === host);
      } catch {
        return false;
      }
    }, `Webhook 必须是 https 且属于 ${hosts.join(" / ")}`);

export const notificationPatchSchema = z
  .object({
    reminder_days: z.array(z.number().int().min(1).max(365)).min(1).max(20),
    email_enabled: z.boolean(),
    telegram_enabled: z.boolean(),
    bark_enabled: z.boolean(),
    serverchan_enabled: z.boolean(),
    wecom_enabled: z.boolean(),
    feishu_enabled: z.boolean(),
    discord_enabled: z.boolean(),
    email_recipient: z.union([z.string().trim().email(), z.literal("")]).nullable(),
    telegram_chat_id: z.string().trim().max(120).nullable(),
    bark_device_key: z.string().trim().max(500).nullable(),
    serverchan_key: z.string().trim().regex(/^[A-Za-z0-9_-]{8,120}$/, "SendKey 格式无效").nullable(),
    wecom_webhook: webhookUrl(["qyapi.weixin.qq.com"]).nullable(),
    feishu_webhook: webhookUrl(["open.feishu.cn", "open.larksuite.com"]).nullable(),
    discord_webhook: webhookUrl(["discord.com", "discordapp.com"]).nullable(),
    timezone: z.literal("Asia/Shanghai"),
  })
  .partial();

export const notificationChannelPatchSchema = z.object({
  channel: z.enum(["email", "telegram", "bark", "serverchan", "wecom", "feishu", "discord"]),
  enabled: z.boolean(),
  config: z.object({
    server_url: z.string().trim().url().max(500).optional(),
    device_key: z.string().trim().max(500).optional(),
    send_key: z.string().trim().max(200).optional(),
    bot_token: z.string().trim().max(500).optional(),
    chat_id: z.string().trim().max(120).optional(),
    webhook_url: z.string().trim().url().max(1000).optional(),
    from: z.union([z.string().trim().email(), z.literal("")]).optional(),
    to: z.union([z.string().trim().email(), z.literal("")]).optional(),
  }),
});
