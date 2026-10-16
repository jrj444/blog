import { createHmac } from "node:crypto";

/**
 * 请求头提取客户端真实 IP
 * @param headers
 */
export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return "0.0.0.0";
}

/**
 * 将 IP 与 User-Agent 做 HMAC-SHA256 单向哈希
 * 不存原始 IP 保护隐私，同时具备识别恶意刷屏的能力
 * @param ip
 * @param userAgent
 */
export function hashClientIdentity(ip: string, userAgent: string): string {
  const secret = process.env.AUTH_SECRET || "fallback-secret-for-dev";
  return createHmac("sha256", secret).update(`${ip}|${userAgent}`).digest("hex");
}
