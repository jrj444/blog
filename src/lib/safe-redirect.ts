/**
 * 登录回跳地址的校验（防开放重定向 / open redirect）。
 *
 * 只放行「站内绝对路径」：
 * - 必须以单个 `/` 开头，如 `/admin/posts`；
 * - 不能是 `//evil.com` 这种协议相对地址（浏览器会当成站外域名）；
 * - 不放行反斜杠：部分浏览器把 `\` 当 `/`，`/\\evil.com` 能绕过前缀判断；
 * - 不放行控制字符：避免被塞进响应头。
 */
export const DEFAULT_ADMIN_PATH = "/admin";

export function safeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_ADMIN_PATH,
): string {
  if (!value) return fallback;

  const target = value.trim();
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  if (target.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;

  return target;
}
