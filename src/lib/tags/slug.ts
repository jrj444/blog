/**
 * 标签 slug 生成（spec-tag-management §6.2）。
 *
 * 纯函数模块：不得 import next/cache、数据库或任何 Next 运行时依赖——
 * 回填脚本（scripts/backfill-tags.ts）在 Node 下直接复用本文件（§13）。
 *
 * 并发约定（§8.2 规则 7 / §20.4）：slug 唯一冲突靠数据库重试兜底，
 * 自动后缀（-2、-3）与唯一索引冲突重试必须落在同一循环里。
 */

/** slug 长度上限（§5.1 / §6.2）：截断与后缀留位都按它算 */
export const TAG_SLUG_MAX_LENGTH = 60;

/** 允许保留的字符：Unicode 字母、数字、组合记号、-、_、.；其余一律转 - */
const DISALLOWED = /[^\p{L}\p{N}\p{M}._-]+/gu;

/**
 * slug 主体：NFKC → 小写（en-US，与 normalizeTagKey 同一 locale 保证可对照）→
 * 非法字符转 - → 合并连续 - → 去首尾 -。
 */
export function slugifyTagName(input: string): string {
  return input
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(DISALLOWED, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 冲突时追加后缀（第 1 次不加，之后 -2、-3…）。
 * 先在「60 − 后缀长度」的前提下截断基础串（截断可能把串切在 - 上，需再去掉尾部 -），
 * 再拼后缀，保证最终长度 ≤ 60（§6.2）。
 */
export function withTagSlugSuffix(base: string, attempt: number): string {
  const suffix = attempt > 1 ? `-${attempt}` : "";
  const truncated = base.slice(0, TAG_SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "");
  return `${truncated}${suffix}`;
}

/** 空结果兜底用的随机串（如 C++、纯 emoji 这类名称清不出可用字符） */
function randomSuffix(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * 由标签名称生成 slug：空结果用 `tag-<8 位随机串>` 兜底，超长截断到 60。
 */
export function buildTagSlug(name: string): string {
  const slug = slugifyTagName(name);
  if (!slug) return `tag-${randomSuffix()}`;
  return slug.length <= TAG_SLUG_MAX_LENGTH
    ? slug
    : slug.slice(0, TAG_SLUG_MAX_LENGTH).replace(/-+$/, "");
}

/**
 * 手工指定的 slug：同样归一化（小写、非法字符转 -、折叠 -），不接收客户端原值写入（§7.3）。
 * 归一化后为空、或超过 60 个字符时直接抛错——不要静默改写用户以为存下来的值（§6.2）。
 */
export function normalizeManualTagSlug(raw: string): string {
  const slug = slugifyTagName(raw);
  if (!slug) {
    throw new Error("slug 无效：需包含字母、数字或汉字等可用字符");
  }
  if (slug.length > TAG_SLUG_MAX_LENGTH) {
    throw new Error(`slug 最长 ${TAG_SLUG_MAX_LENGTH} 个字符`);
  }
  return slug;
}
