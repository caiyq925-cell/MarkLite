import type { EntityHit } from "./types";

const TECHNICAL_VERBS = [
  "调用", "注入", "继承", "实现", "查询", "返回",
  "访问", "调用", "创建", "销毁", "注册", "监听",
];

const COMMON_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that",
  "have", "has", "had", "are", "was", "were", "will",
  "would", "could", "should", "can", "may", "might",
  "about", "into", "over", "after", "before", "between",
  "apple", "google", "facebook", "amazon", "microsoft",
]);

/**
 * 检查是否包含驼峰特征（大小写交替）
 */
function hasCamelCase(word: string): boolean {
  return /[a-z][A-Z]/.test(word) || /[A-Z][a-z]/.test(word);
}

/**
 * 检查是否为下划线命名
 */
function hasUnderscores(word: string): boolean {
  return word.includes("_");
}

/**
 * 检查是否符合表名特征
 */
function isSnakeCaseMatch(word: string): boolean {
  const parts = word.split("_");
  if (parts.length < 3) return false;
  const prefixMatch = /^(t_|v_|tmp_|tab_)/.test(word);
  const suffixMatch = /(_id|_log|_cfg)$/.test(word);
  return prefixMatch || suffixMatch;
}

/**
 * 检查上下文中是否有技术动词
 */
function isContextual(text: string, from: number): boolean {
  const before = text.slice(Math.max(0, from - 40), from);
  return TECHNICAL_VERBS.some((v) => before.includes(v));
}

/**
 * 扫描文本中的实体（类名、方法名、表名）
 * @param text - 源文本
 * @param intensity - 着色强度：aggressive 或 conservative
 * @param blacklist - 用户黑名单词
 */
export function scanEntities(
  text: string,
  intensity: "aggressive" | "conservative",
  blacklist: string[] = []
): EntityHit[] {
  const hits: EntityHit[] = [];
  const blacklistSet = new Set(blacklist);

  // 匹配驼峰和下划线标识符
  const pattern = /([A-Za-z][A-Za-z0-9_]+)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const word = match[1];
    const from = match.index;
    const to = from + word.length;

    // 跳过黑名单词
    if (blacklistSet.has(word)) continue;

    // 跳过短词和常见词
    if (word.length < 6) continue;
    if (COMMON_WORDS.has(word.toLowerCase())) continue;

    let kind: "class" | "method" | "table" | null = null;

    // 驼峰识别
    if (hasCamelCase(word)) {
      if (word[0] === word[0].toUpperCase() && /[A-Z]/.test(word.slice(1))) {
        kind = "class";
      } else if (word[0] === word[0].toLowerCase()) {
        kind = "method";
      }
    }

    // 下划线识别（表名）
    if (hasUnderscores(word) && isSnakeCaseMatch(word)) {
      kind = "table";
    }

    // 上下文过滤
    if (kind) {
      // 保守模式：只在有技术动词上下文中着色
      if (intensity === "conservative" && !isContextual(text, from)) {
        kind = null;
      }
    }

    if (kind) {
      hits.push({ from, to, kind, content: word });
    }
  }

  return hits;
}
