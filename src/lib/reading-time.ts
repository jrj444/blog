export function readingTime(content: string) {
  const chars = (content ?? "").replace(/\s+/g, "").length;
  const minutes = Math.max(1, Math.round(chars / 350));
  return { chars, minutes };
}
