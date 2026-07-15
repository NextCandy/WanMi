import { Hono } from "hono";

import { bulkDnsSchema, dnsRecordSchema } from "../../../shared/schemas/api";
import { fail, ok, writeOperationLog } from "../../http";
import type { DnsRecord } from "../../providers/types";
import type { AppBindings } from "../../types";
import { providerFailure, providerFor, registrar } from "./registrars";

interface DomainAccountRow { id: number; normalized_domain: string; registrar_account_ref: number | null; }

async function domainAccount(db: D1Database, domainId: number): Promise<DomainAccountRow | null> {
  return db.prepare("SELECT id, normalized_domain, registrar_account_ref FROM domains WHERE id = ?").bind(domainId).first<DomainAccountRow>();
}

async function loadProvider(c: Parameters<typeof fail>[0], domain: DomainAccountRow) {
  if (!domain.registrar_account_ref) throw new Error("该域名尚未关联真实注册商账户");
  const account = await registrar(c.env.DB, domain.registrar_account_ref);
  if (!account) throw new Error("关联的注册商账户不存在");
  return providerFor(c, account);
}

async function replaceCache(db: D1Database, domainId: number, records: DnsRecord[]): Promise<void> {
  const statements = [db.prepare("DELETE FROM dns_records_cache WHERE domain_id = ?").bind(domainId)];
  const insert = db.prepare(`INSERT INTO dns_records_cache (
    domain_id, provider_record_id, type, name, content, ttl, priority, proxied, last_synced_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
  statements.push(...records.map((record) => insert.bind(domainId, record.id, record.type, record.name, record.content, record.ttl, record.priority, record.proxied === null ? null : record.proxied ? 1 : 0)));
  await db.batch(statements);
}

async function upsertCache(db: D1Database, domainId: number, record: DnsRecord): Promise<void> {
  await db.prepare(`INSERT INTO dns_records_cache (
    domain_id, provider_record_id, type, name, content, ttl, priority, proxied, last_synced_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(domain_id, provider_record_id) DO UPDATE SET type=excluded.type, name=excluded.name,
    content=excluded.content, ttl=excluded.ttl, priority=excluded.priority, proxied=excluded.proxied,
    last_synced_at=CURRENT_TIMESTAMP`)
    .bind(domainId, record.id, record.type, record.name, record.content, record.ttl, record.priority, record.proxied === null ? null : record.proxied ? 1 : 0)
    .run();
}

export const dnsRoutes = new Hono<AppBindings>();

dnsRoutes.get("/domains/:id/dns", async (c) => {
  const domain = await domainAccount(c.env.DB, Number(c.req.param("id")));
  if (!domain) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  try {
    const records = await (await loadProvider(c, domain)).listDnsRecords(domain.normalized_domain);
    await replaceCache(c.env.DB, domain.id, records);
    return ok(c, records);
  } catch (error) { return providerFailure(c, error); }
});

dnsRoutes.post("/domains/:id/dns", async (c) => {
  const parsed = dnsRecordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "DNS_RECORD_INVALID", "DNS 记录无效", parsed.error.issues);
  const domain = await domainAccount(c.env.DB, Number(c.req.param("id")));
  if (!domain) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  try {
    const record = await (await loadProvider(c, domain)).createDnsRecord(domain.normalized_domain, parsed.data);
    await upsertCache(c.env.DB, domain.id, record);
    return ok(c, record, 201);
  } catch (error) { return providerFailure(c, error); }
});

dnsRoutes.patch("/domains/:id/dns/:recordId", async (c) => {
  const parsed = dnsRecordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "DNS_RECORD_INVALID", "DNS 记录无效", parsed.error.issues);
  const domain = await domainAccount(c.env.DB, Number(c.req.param("id")));
  if (!domain) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  try {
    const record = await (await loadProvider(c, domain)).updateDnsRecord(domain.normalized_domain, c.req.param("recordId"), parsed.data);
    await c.env.DB.prepare(`UPDATE dns_records_cache SET type=?, name=?, content=?, ttl=?, priority=?, proxied=?, last_synced_at=CURRENT_TIMESTAMP WHERE domain_id=? AND provider_record_id=?`)
      .bind(record.type, record.name, record.content, record.ttl, record.priority, record.proxied === null ? null : record.proxied ? 1 : 0, domain.id, record.id).run();
    return ok(c, record);
  } catch (error) { return providerFailure(c, error); }
});

dnsRoutes.delete("/domains/:id/dns/:recordId", async (c) => {
  const domain = await domainAccount(c.env.DB, Number(c.req.param("id")));
  if (!domain) return fail(c, 404, "DOMAIN_NOT_FOUND", "域名不存在");
  try {
    await (await loadProvider(c, domain)).deleteDnsRecord(domain.normalized_domain, c.req.param("recordId"));
    await c.env.DB.prepare("DELETE FROM dns_records_cache WHERE domain_id = ? AND provider_record_id = ?").bind(domain.id, c.req.param("recordId")).run();
    return ok(c, { deleted: true });
  } catch (error) { return providerFailure(c, error); }
});

dnsRoutes.post("/dns/bulk", async (c) => {
  const parsed = bulkDnsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, "BULK_DNS_INVALID", "批量 DNS 参数无效", parsed.error.issues);
  const results: Array<{ domainId: number; domain?: string; success: boolean; record?: DnsRecord; error?: string }> = [];
  for (const domainId of parsed.data.domainIds) {
    const domain = await domainAccount(c.env.DB, domainId);
    if (!domain) { results.push({ domainId, success: false, error: "域名不存在" }); continue; }
    try {
      const record = await (await loadProvider(c, domain)).createDnsRecord(domain.normalized_domain, parsed.data.record);
      await upsertCache(c.env.DB, domain.id, record);
      results.push({ domainId, domain: domain.normalized_domain, success: true, record });
    } catch (error) { results.push({ domainId, domain: domain.normalized_domain, success: false, error: error instanceof Error ? error.message : "DNS 更新失败" }); }
  }
  const user = c.get("authUser");
  const successes = results.filter((item) => item.success).length;
  await writeOperationLog(c.env.DB, { action: "dns.bulk.create", resourceType: "domain", message: `批量 DNS：成功 ${successes}，失败 ${results.length - successes}`, details: { successes, failures: results.length - successes }, actorUserId: user.id, success: successes === results.length });
  return ok(c, { results, successes, failures: results.length - successes });
});
