// 搜索词的归一化与转义。
//
// 背景：列表/标签页的搜索走 `ilike`，而 `%` / `_` 在 SQL LIKE 里是通配符。
// 用户输入 `%` 时 `%${term}%` 会变成 `%%%`，命中全表；输入 `_` 会匹配任意单字符。
// 这里的 pattern 统一交给 Drizzle 作为**参数**绑定（不是拼进 SQL 文本），
// 所以只需要处理 LIKE 元字符本身，不存在 SQL 注入问题。
//
// PostgreSQL 的 LIKE 默认转义符就是 `\`，因此把 `\` `%` `_` 各加一个反斜杠前缀即可。

/** LIKE 元字符转义（顺序重要：先转义反斜杠自身） */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 搜索词长度上限：避免超长输入触发全表 trgm 扫描 */
export const MAX_SEARCH_LENGTH = 64;

export type SearchTerm = {
  /** 归一化后的搜索词（保留用户原意，用于回显、排序加权） */
  term: string;
  /** 转义后的 LIKE 模式，可直接用于 `%${pattern}%` */
  pattern: string;
};

/**
 * 归一化搜索词：去首尾空白、压缩内部空白、截断到上限。
 * 返回 null 表示「没有有效搜索词」，调用方应直接跳过搜索条件。
 */
export function normalizeSearchTerm(raw: string | undefined | null): SearchTerm | null {
  if (!raw) return null;

  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (!collapsed) return null;

  const term = collapsed.slice(0, MAX_SEARCH_LENGTH);
  return { term, pattern: escapeLike(term) };
}
