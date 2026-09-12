/**
 * 把日期格式化为中文格式,如「2026年8月31日」。
 * 可传入 Intl.DateTimeFormatOptions 覆盖默认的年月日格式。
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  }).format(toDate(date));
}

/**
 * 统一把「Date 或 ISO 字符串」还原成 Date。
 *
 * 为什么需要：`unstable_cache` 会序列化返回值，数据库查询结果里的 `Date`
 * 一旦跨过缓存边界就变成字符串。所以这些值在类型上要按 `Date | string` 处理，
 * 用到 Date 方法（toISOString / toUTCString / getMonth）前先经过这里。
 */
export function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** 同 toDate，但用于 `<time dateTime>` 这类需要 ISO 字符串的场景 */
export function toIsoString(value: Date | string): string {
  return toDate(value).toISOString();
}

/** RFC 1123 格式（RSS 的 pubDate 需要），入参可以是 Date 或 ISO 字符串 */
export function toUtcString(value: Date | string): string {
  return toDate(value).toUTCString();
}
