/**
 * 把日期格式化为中文格式,如「2026年8月31日」。
 * 可传入 Intl.DateTimeFormatOptions 覆盖默认的年月日格式。
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  }).format(d);
}
