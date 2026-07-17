export const DEFAULT_AI_PROVIDER = "deepseek" as const;
export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_AI_MODEL = "deepseek-chat";
export const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1/chat/completions";
export const OPENCODE_ZEN_MODEL = "deepseek-chat";
export const DEFAULT_DOMAIN_DESCRIPTION_PROMPT = "你是中文域名品牌文案编辑。请为域名「{domain}」撰写一段 40-80 字的中文简介。后缀：{tld}；主体长度：{length}；类型：{type}。突出可能的品牌联想与适用方向，不虚构流量、收入、交易、报价或所有权信息。只输出简介正文，不要标题、引号或解释。";

export type AiProvider = typeof DEFAULT_AI_PROVIDER | "openai_compatible";
