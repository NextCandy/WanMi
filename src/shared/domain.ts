import type { NormalizedDomain } from "./types/domain";

export class DomainValidationError extends Error {
  readonly code: "invalid_domain" | "tld_mismatch";

  constructor(code: "invalid_domain" | "tld_mismatch", message: string) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
  }
}

function asciiHostname(input: string): string {
  let candidate = input.trim().toLowerCase();
  candidate = candidate.replace(/^[a-z][a-z\d+.-]*:\/\//i, "").replace(/^\/\//, "");
  candidate = candidate.split(/[/?#]/, 1)[0] ?? "";
  candidate = candidate.replace(/:\d+$/, "").replace(/\.+$/, "");
  if (!candidate) throw new DomainValidationError("invalid_domain", "域名为空");

  let hostname: string;
  try {
    hostname = new URL(`http://${candidate}`).hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    throw new DomainValidationError("invalid_domain", "域名无法解析");
  }

  if (!hostname || hostname.length > 253 || !hostname.includes(".")) {
    throw new DomainValidationError("invalid_domain", "域名长度或结构无效");
  }

  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[a-z0-9-]+$/.test(label),
    )
  ) {
    throw new DomainValidationError("invalid_domain", "域名标签格式无效");
  }

  return hostname;
}

export function normalizeDomain(input: string, csvTld?: string): NormalizedDomain {
  const normalizedDomain = asciiHostname(input);
  const rawTld = csvTld?.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  const tld = rawTld ? asciiHostname(`x.${rawTld}`).slice(2) : normalizedDomain.split(".").at(-1)!;

  if (!normalizedDomain.endsWith(`.${tld}`)) {
    throw new DomainValidationError(
      "tld_mismatch",
      `域名与 CSV TLD 不一致：${normalizedDomain} / ${tld}`,
    );
  }

  const name = normalizedDomain.slice(0, -(tld.length + 1));
  if (!name) throw new DomainValidationError("invalid_domain", "域名主体为空");

  return {
    fullDomain: normalizedDomain,
    normalizedDomain,
    name,
    tld,
  };
}

export function domainNameLength(name: string): number {
  return Array.from(name.replaceAll(".", "")).length;
}

export function compareDomains(
  left: { normalizedDomain: string; name: string; isFeatured: boolean },
  right: { normalizedDomain: string; name: string; isFeatured: boolean },
): number {
  if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
  const lengthDiff = domainNameLength(left.name) - domainNameLength(right.name);
  if (lengthDiff !== 0) return lengthDiff;
  return left.normalizedDomain.localeCompare(right.normalizedDomain, "en");
}
