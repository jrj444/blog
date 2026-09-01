// 站点级配置：供 sitemap / robots / RSS / 根布局 metadata 共用。
// 生产部署请设置 SITE_URL（正式域名）；否则回退到 AUTH_URL，再回退本地。
const siteUrl = process.env.SITE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: "JIANG RUIJIAN",
  description:
    "Notes on engineering trade-offs, mistakes, and some days that have nothing to do with code.",
  url: siteUrl.replace(/\/+$/, ""), // 去掉末尾斜杠，方便拼路径
} as const;

/** 把站内路径拼成绝对 URL，如 absUrl("/posts") */
export function absUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}
