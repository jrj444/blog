/** 每分钟字符数——SQL 侧（queries.ts 的 regexp_replace 长度）与应用侧共用同一口径 */
export const MINUTES_PER_CHAR = 350;

export function readingTime(content: string) {
  const chars = (content ?? "").replace(/\s+/g, "").length;
  const minutes = Math.max(1, Math.round(chars / MINUTES_PER_CHAR));
  return { chars, minutes };
}
