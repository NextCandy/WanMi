import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12, "新密码至少 12 位").max(1024),
});

export const publicDomainQuerySchema = z.object({
  q: z.string().trim().max(253).optional(),
  tld: z.string().trim().max(253).optional(),
  length: z.coerce.number().int().min(1).max(253).optional(),
  category: z.string().trim().max(80).optional(),
  featured: z.enum(["true", "false"]).optional(),
  kind: z.enum(["digits", "letters"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(60),
  sort: z
    .enum(["default", "domain_asc", "domain_desc", "price_desc", "price_asc", "views_desc", "added_desc", "length_asc"])
    .default("default"),
});

export const offerInputSchema = z.object({
  domain: z.string().trim().min(3).max(253),
  contact: z.string().trim().min(3).max(200),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?$/, "报价必须是数字")
    .nullable()
    .optional(),
  currency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  message: z.string().trim().max(1000).nullable().optional(),
});

export const adminDomainQuerySchema = publicDomainQuerySchema.extend({
  listed: z.enum(["true", "false"]).optional(),
  listingStatus: z.string().trim().max(120).optional(),
  fastTransfer: z.string().trim().max(120).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  orderBy: z.enum(["domain", "price", "floor", "views", "leads", "date_added"]).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  ids: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const leadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(["new", "read", "archived"]).optional(),
});

export const leadPatchSchema = z.object({
  status: z.enum(["new", "read", "archived"]),
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
});

export const domainPatchSchema = domainInputSchema.partial().omit({ fullDomain: true, tld: true });

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

export const settingsPatchSchema = z
  .object({
    site_name: z.string().trim().min(1).max(80),
    site_description: z.string().trim().max(240),
    site_bio: z.string().trim().max(500).nullable(),
    accent_color: z.string().regex(/^#[0-9a-f]{6}$/i),
    display_density: z.enum(["compact", "comfortable", "spacious"]),
    featured_first: z.boolean(),
    show_prices: z.boolean(),
    copyright_text: z.string().trim().max(160).nullable(),
    icp_number: z.string().trim().max(80).nullable(),
    contact_email: z.union([z.string().trim().email(), z.literal("")]).nullable(),
    contact_wechat: z.string().trim().max(120).nullable(),
    contact_telegram: z.string().trim().max(120).nullable(),
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

export const registrarInputSchema = z.object({
  provider: z.enum(["cloudflare", "godaddy", "namesilo", "porkbun", "dnspod", "aliyun"]),
  displayName: z.string().trim().min(1).max(120),
  credentials: z.record(z.string(), z.string().max(5000)),
});

export const registrarPatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  credentials: z.record(z.string(), z.string().max(5000)).optional(),
});

export const dnsRecordSchema = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SRV"]),
  name: z.string().trim().min(1).max(253).default("@"),
  content: z.string().trim().min(1).max(4096),
  ttl: z.number().int().min(1).max(604800).nullable().optional(),
  priority: z.number().int().min(0).max(65535).nullable().optional(),
  proxied: z.boolean().nullable().optional(),
});

export const bulkDnsSchema = z.object({
  domainIds: z.array(z.number().int().positive()).min(1).max(100),
  record: dnsRecordSchema,
});
