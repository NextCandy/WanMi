const POPULAR_TLDS = new Set(["com", "net", "org"]);
const FEATURED_TLDS = new Set(["ooo", "is", "io", "ai", "cc", "me"]);
const EMERGING_TLDS = new Set(["app", "blog", "cloud", "dev", "page", "site", "store", "wiki", "xyz"]);

const PINYIN_MEANINGS: Readonly<Record<string, string>> = {
  ai: "爱/艾/智",
  an: "安/岸/案",
  bao: "宝/保/包",
  dao: "道/岛/导",
  dian: "点/电/店",
  fan: "帆/凡/范",
  fu: "福/富/赋",
  guo: "国/果/过",
  hao: "好/号/浩",
  hua: "华/花/画",
  hui: "汇/慧/会",
  ji: "吉/集/记",
  jia: "家/佳/嘉",
  le: "乐/了/勒",
  li: "力/利/礼",
  mei: "美/媒/魅",
  mi: "米/觅/密",
  ming: "名/明/鸣",
  pin: "品/拼/频",
  qi: "启/奇/企",
  shang: "商/尚/上",
  shu: "数/书/树",
  tong: "通/同/童",
  wan: "万/玩/湾",
  wang: "网/旺/王",
  wei: "微/维/未",
  xin: "新/心/信",
  xing: "星/兴/行",
  yi: "易/艺/亿",
  you: "优/游/友",
  yu: "语/域/御",
  yuan: "源/元/缘",
  yun: "云/运/韵",
  zhi: "智/知/志",
};

export const TLD_REGISTRY_URLS: Readonly<Record<string, string>> = {
  ai: "https://www.nic.ai/",
  app: "https://www.registry.google/tlds/app/",
  best: "https://nic.best/",
  blog: "https://nic.blog/",
  cc: "https://www.verisign.com/en_US/domain-names/cc-domain-names/index.xhtml",
  cn: "https://www.cnnic.com.cn/",
  "com.cn": "https://www.cnnic.com.cn/",
  com: "https://www.verisign.com/en_US/domain-names/com-domain-names/index.xhtml",
  dev: "https://www.registry.google/tlds/dev/",
  io: "https://nic.io/",
  is: "https://www.isnic.is/",
  me: "https://domain.me/",
  net: "https://www.verisign.com/en_US/domain-names/net-domain-names/index.xhtml",
  ooo: "https://www.infibeam.com/",
  org: "https://publicinterestregistry.org/",
  page: "https://www.registry.google/tlds/page/",
  top: "https://www.nic.top/",
  wiki: "https://nic.wiki/",
  xyz: "https://gen.xyz/",
};

export interface DomainCharacterProfile {
  count: number;
  composition: "Letters" | "Digits" | "Alphanumeric" | "Hyphenated" | "Mixed";
  hasRepeatedCharacter: boolean;
}

function normalizeTld(tld: string): string {
  return tld.trim().replace(/^\.+/, "").toLowerCase();
}

export function getDomainCharacterProfile(name: string): DomainCharacterProfile {
  const characters = Array.from(name);
  let composition: DomainCharacterProfile["composition"] = "Mixed";
  if (/^[a-z]+$/i.test(name)) composition = "Letters";
  else if (/^\d+$/.test(name)) composition = "Digits";
  else if (/^[a-z\d]+$/i.test(name)) composition = "Alphanumeric";
  else if (/^[a-z\d-]+$/i.test(name)) composition = "Hyphenated";

  return {
    count: characters.length,
    composition,
    hasRepeatedCharacter: /(.)\1/i.test(name),
  };
}

export function getTldHeat(tld: string): "Popular" | "Niche" | "Emerging" | "Rare" {
  const normalized = normalizeTld(tld);
  if (POPULAR_TLDS.has(normalized)) return "Popular";
  if (FEATURED_TLDS.has(normalized)) return "Niche";
  if (EMERGING_TLDS.has(normalized)) return "Emerging";
  return "Rare";
}

export function getTldRegistryUrl(tld: string): string {
  const normalized = normalizeTld(tld);
  return TLD_REGISTRY_URLS[normalized] ?? `https://www.iana.org/domains/root/db/${encodeURIComponent(normalized)}.html`;
}

function findPinyinSyllables(value: string): string[] | null {
  const memo = new Map<number, string[] | null>();
  const syllables = Object.keys(PINYIN_MEANINGS).sort((left, right) => right.length - left.length);

  function visit(index: number): string[] | null {
    if (index === value.length) return [];
    if (memo.has(index)) return memo.get(index) ?? null;

    for (const syllable of syllables) {
      if (!value.startsWith(syllable, index)) continue;
      const remainder = visit(index + syllable.length);
      if (remainder) {
        const result = [syllable, ...remainder];
        memo.set(index, result);
        return result;
      }
    }

    memo.set(index, null);
    return null;
  }

  return visit(0);
}

export function getPinyinMeaning(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z]+$/.test(normalized)) return null;
  const syllables = findPinyinSyllables(normalized);
  if (!syllables) return null;
  return syllables.map((syllable) => `${syllable}（${PINYIN_MEANINGS[syllable]}）`).join(" · ");
}
