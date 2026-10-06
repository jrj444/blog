/**
 * 标签名称 / 唯一键归一化（spec-tag-management §6.1）。
 *
 * 纯函数模块：不得 import next/cache、数据库或任何 Next 运行时依赖——
 * 回填脚本（scripts/backfill-tags.ts）在 Node 下直接复用本文件（§13）。
 */

/**
 * 展示标签名称：NFKC → 去首尾空白 → 连续空白折叠为一个空格。
 * 保留显示大小写与标点。
 */
export function normalizeTagName(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * 唯一键（tags.normalized_key）：在归一化名称基础上按 en-US 转小写。
 * `React` / `REACT` / `Ｒｅａｃｔ` 归一到同一个 key，是防重复的第一道防线。
 */
export function normalizeTagKey(input: string): string {
  return normalizeTagName(input).toLocaleLowerCase("en-US");
}
