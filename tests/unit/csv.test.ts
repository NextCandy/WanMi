import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseDomainCsv } from "../../src/shared/csv";
import { DOMAIN_CSV_HEADERS, type DomainCsvHeader } from "../../src/shared/types/domain";

function csvRow(overrides: Partial<Record<DomainCsvHeader, string>> = {}): string {
  const defaults: Record<DomainCsvHeader, string> = Object.fromEntries(DOMAIN_CSV_HEADERS.map((header) => [header, "-"])) as Record<DomainCsvHeader, string>;
  Object.assign(defaults, {
    Domain: "example.com",
    TLD: "com",
    "Buy Now Price": "100.25",
    "Floor Price": "0",
    "Min Offer": "20",
    "Lease to Own": "N",
    "Show Buy Now Option": "Y",
    "Show Lease to Own Option": "N",
    "Show Make Offer Option": "Y",
    Hidden: "N",
    "Date Added (UTC)": "Tue Mar 17 2026",
    "Listing Status": "Listed",
    "30-day Unique Searches": "Members-only feature",
  }, overrides);
  return DOMAIN_CSV_HEADERS.map((header) => defaults[header]).join(",");
}

describe("真实 CSV", () => {
  it("完整解析本次中文表头 CSV", async () => {
    const source = await fs.readFile("data/source/WanMi.csv", "utf8");
    const result = parseDomainCsv(source);
    expect(result.report).toMatchObject({ rawRecordCount: 859, parsedCount: 859, uniqueCount: 859, duplicateCount: 0, invalidCount: 0 });
    expect(result.report.headers).toEqual(["域名", "注册日期", "到期日期", "注册商", "后缀", "简介", "Premium"]);
    expect(result.records.filter((record) => record.initialFeatured)).toHaveLength(87);
    expect(result.records.every((record) => record.initialDescription === "")).toBe(true);
    expect(result.records[0]).toMatchObject({
      normalizedDomain: "01234567.best",
      initialRegisteredAt: "2026-02-21T00:00:00.000Z",
      initialExpiresAt: "2027-02-21T00:00:00.000Z",
      initialRegistrarName: "Spaceship",
    });
  });

  it("按中文表头名称映射简介和精品，不依赖固定列序", () => {
    const result = parseDomainCsv("Premium,简介,注册日期,到期日期,注册商,域名\r\nY,公开简介,2020/1/2,2030-03-04,Spaceship,wanmi.org\r\n");
    expect(result.records[0]).toMatchObject({ normalizedDomain: "wanmi.org", initialDescription: "公开简介", initialFeatured: true, initialRegisteredAt: "2020-01-02T00:00:00.000Z", initialExpiresAt: "2030-03-04T00:00:00.000Z", initialRegistrarName: "Spaceship" });
  });
});

describe("CSV 边界条件", () => {
  it("解析安全金额、UTC 日期和特殊空值", () => {
    const result = parseDomainCsv(`\uFEFF${DOMAIN_CSV_HEADERS.join(",")}\n${csvRow()}`);
    expect(result.records[0]).toMatchObject({ buyNowPrice: "100.25", dateAddedAt: "2026-03-17T00:00:00.000Z", uniqueSearches30d: null, isListed: true });
  });

  it("报告重复、空域名和 TLD 不匹配", () => {
    const rows = [csvRow(), csvRow(), csvRow({ Domain: "" }), csvRow({ Domain: "sample.net", TLD: "com" })];
    const result = parseDomainCsv(`${DOMAIN_CSV_HEADERS.join(",")}\n${rows.join("\n")}`);
    expect(result.report.duplicateCount).toBe(1);
    expect(result.report.invalidCount).toBe(2);
    expect(result.report.issues.map((issue) => issue.code)).toEqual(["duplicate_domain", "empty_domain", "tld_mismatch"]);
  });

  it("拒绝重复表头；缺市场表头但含 Domain 列时走最小模式；完全无法识别时报错", () => {
    expect(() => parseDomainCsv("Domain,TLD,TLD\nexample.com,com,com")).toThrow(/重复表头/);
    expect(parseDomainCsv("Domain,TLD\nexample.com,com").records).toHaveLength(1);
    expect(() => parseDomainCsv("Foo,Bar\nx,y")).toThrow(/缺少表头/);
  });
});

describe("最小模式：只导入域名", () => {
  it("解析含 Domain 列的简单 CSV，忽略其余列且市场字段置空", () => {
    const result = parseDomainCsv("Domain,备注\nwanmi.org,好名字\nexample.com,\n", "simple.csv");
    expect(result.records).toHaveLength(2);
    expect(result.records[0].normalizedDomain).toBe("wanmi.org");
    expect(result.records[0].buyNowPrice).toBeNull();
    expect(result.records[0].dateAddedAt).toBeNull();
    expect(result.records[0].listingStatus).toBeNull();
    expect(result.report.parsedCount).toBe(2);
  });

  it("解析无表头的纯域名列表并报告重复与非法行", () => {
    const result = parseDomainCsv("wanmi.org\nWANMI.ORG\nnot a domain\nexample.com\n", "list.csv");
    expect(result.records.map((record) => record.normalizedDomain)).toEqual(["wanmi.org", "example.com"]);
    expect(result.report.duplicateCount).toBe(1);
    expect(result.report.invalidCount).toBe(1);
  });
});
