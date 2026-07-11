export const AUTO_CATEGORY_ORDER = [
  "纯字母", "纯数字", "单拼", "双拼", "三拼", "三数字", "四数字", "五数字", "六数字",
] as const;

export type AutoCategory = (typeof AUTO_CATEGORY_ORDER)[number];

// 不含声调的汉语拼音音节。分类取最少音节拆分，避免把一个完整音节拆成多个短音节。
const PINYIN = new Set(`
a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo
da dai dan dang dao de dei deng di dia dian diao die ding diu dong dou du duan dui dun duo
e ei en eng er fa fan fang fei fen feng fo fou fu
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo
la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu luan lun luo lv lve
ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve
o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo
ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
wa wai wan wang wei wen weng wo wu
xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo
`.trim().split(/\s+/));

export function pinyinSyllableCount(value: string): number | null {
  if (!/^[a-z]+$/.test(value)) return null;
  const best = new Array<number | undefined>(value.length + 1).fill(undefined);
  best[0] = 0;
  for (let end = 1; end <= value.length; end += 1) {
    for (let start = Math.max(0, end - 6); start < end; start += 1) {
      const previous = best[start];
      if (previous === undefined || !PINYIN.has(value.slice(start, end))) continue;
      const count = previous + 1;
      const current = best[end];
      if (current === undefined || count < current) best[end] = count;
    }
  }
  return best[value.length] ?? null;
}

export function classifyDomainName(rawName: string): AutoCategory[] {
  const name = rawName.trim().toLowerCase();
  const categories: AutoCategory[] = [];
  if (/^[a-z]+$/.test(name)) {
    categories.push("纯字母");
    const syllables = pinyinSyllableCount(name);
    if (syllables === 1) categories.push("单拼");
    if (syllables === 2) categories.push("双拼");
    if (syllables === 3) categories.push("三拼");
  }
  if (/^\d+$/.test(name)) {
    categories.push("纯数字");
    const lengthCategory: Partial<Record<number, AutoCategory>> = { 3: "三数字", 4: "四数字", 5: "五数字", 6: "六数字" };
    const category = lengthCategory[name.length];
    if (category) categories.push(category);
  }
  return categories;
}
