/**
 * 分类名的中→英显示映射。
 *
 * 分类值是数据库里的中文（AUTO_CATEGORY_ORDER 与人工 category 两套），后台仍按中文管理，
 * 这里只负责前台展示。映射表未覆盖的值原样返回，新增分类不会因为漏配而显示空白。
 */
const CATEGORY_LABELS: Record<string, string> = {
  // 自动分类
  纯数字: "Numeric",
  三数字: "3 Digits",
  四数字: "4 Digits",
  五数字: "5 Digits",
  六数字: "6 Digits",
  七数字: "7 Digits",
  八数字: "8 Digits",
  九数字: "9 Digits",
  纯字母: "Letters",
  三字母: "3 Letters",
  四字母: "4 Letters",
  拼音: "Pinyin",
  单拼: "1 Pinyin",
  双拼: "2 Pinyin",
  三拼: "3 Pinyin",
  四拼: "4 Pinyin",
  英文词语: "English Word",
  杂米: "Mixed",
  二杂: "2 Mixed",
  三杂: "3 Mixed",
  // 人工主分类
  数字: "Numeric",
  字母: "Letters",
  英文: "English",
  其他: "Other",
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value;
}
