export const AUTO_CATEGORY_ORDER = [
  "纯数字", "三数字", "四数字", "五数字", "六数字", "七数字", "八数字", "九数字",
  "纯字母", "三字母", "四字母", "拼音", "单拼", "双拼", "三拼", "四拼", "英文词语",
  "杂米", "二杂", "三杂",
] as const;

export type AutoCategory = (typeof AUTO_CATEGORY_ORDER)[number];

export type PrimaryCategory = "数字" | "字母" | "拼音" | "英文" | "杂米" | "其他";
export interface DomainClassification {
  primary: PrimaryCategory;
  subtype: string;
  confidence: number;
}

const PINYIN_INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w", ""];
const PINYIN_FINALS = ["iang", "iong", "uang", "iao", "ian", "ing", "ong", "ang", "eng", "uan", "uai", "ai", "ei", "ao", "ou", "an", "en", "er", "ia", "ie", "iu", "in", "ua", "uo", "ui", "un", "ve", "ue", "a", "o", "e", "i", "u", "v"];

// 使用稳定的贪心声母/韵母拆分规则，确保自动分类结果可复现。
export function pinyinSyllableCount(value: string): number | null {
  let rest = value.trim().toLowerCase();
  if (!/^[a-z]+$/.test(rest)) return null;
  let count = 0;
  while (rest) {
    let matched = false;
    for (const initial of PINYIN_INITIALS) {
      if (!rest.startsWith(initial)) continue;
      const remainder = rest.slice(initial.length);
      for (const final of PINYIN_FINALS) {
        if (!remainder.startsWith(final)) continue;
        rest = remainder.slice(final.length);
        count += 1;
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (!matched) return null;
  }
  return count;
}

const NUMBER_LABELS: Partial<Record<number, AutoCategory>> = {
  3: "三数字", 4: "四数字", 5: "五数字", 6: "六数字", 7: "七数字", 8: "八数字", 9: "九数字",
};
const PINYIN_LABELS: Partial<Record<number, AutoCategory>> = { 1: "单拼", 2: "双拼", 3: "三拼", 4: "四拼" };

export function classifyDomainName(rawName: string): AutoCategory[] {
  const classification = classifyDomain(rawName);
  if (classification.primary === "数字") {
    const lengthLabel = NUMBER_LABELS[rawName.trim().length];
    return lengthLabel ? ["纯数字", lengthLabel] : ["纯数字"];
  }
  if (["字母", "拼音", "英文"].includes(classification.primary)) {
    const categories: AutoCategory[] = ["纯字母"];
    if (classification.primary === "拼音") {
      categories.push("拼音");
      const count = Number(classification.subtype.slice("pinyin".length));
      const label = PINYIN_LABELS[count];
      if (label) categories.push(label);
    } else if (classification.primary === "英文") {
      categories.push("英文词语");
    } else if (classification.subtype === "alpha3") categories.push("三字母");
    else if (classification.subtype === "alpha4") categories.push("四字母");
    return categories;
  }
  if (classification.primary === "杂米") {
    if (classification.subtype === "mixed2") return ["杂米", "二杂"];
    if (classification.subtype === "mixed3") return ["杂米", "三杂"];
    return ["杂米"];
  }
  return [];
}

export function classifyDomain(rawName: string): DomainClassification {
  const name = rawName.trim().toLowerCase();
  if (!name || name.startsWith("xn--") || name.includes(".")) return { primary: "其他", subtype: "other", confidence: 1 };
  if (/^\d+$/.test(name)) {
    const subtype = name.length >= 3 && name.length <= 9 ? `num${name.length}` : "num";
    return { primary: "数字", subtype, confidence: 1 };
  }
  if (/^[a-z]+$/.test(name)) {
    const syllables = pinyinSyllableCount(name);
    if (syllables && syllables <= 4) return { primary: "拼音", subtype: `pinyin${syllables}`, confidence: 0.9 };
    if (name.length === 3) return { primary: "字母", subtype: "alpha3", confidence: 0.9 };
    if (name.length === 4) return { primary: "字母", subtype: "alpha4", confidence: 0.9 };
    if (name.length >= 5 && /[aeiou]/.test(name)) return { primary: "英文", subtype: "english", confidence: 0.7 };
    return { primary: "字母", subtype: "alpha", confidence: 0.9 };
  }
  if (/^[a-z0-9-]+$/.test(name)) {
    const kinds = [/[a-z]/.test(name), /\d/.test(name), /[^a-z0-9]/.test(name)].filter(Boolean).length;
    return { primary: "杂米", subtype: kinds >= 3 ? "mixed3" : kinds === 2 ? "mixed2" : "mixed", confidence: 1 };
  }
  return { primary: "其他", subtype: "other", confidence: 1 };
}
