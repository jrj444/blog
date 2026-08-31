// 站点级配置：供 sitemap / robots / RSS / 根布局 metadata 共用。
// 生产部署请设置 SITE_URL（正式域名）；否则回退到 AUTH_URL，再回退本地。
const siteUrl = process.env.SITE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: "jiangruijian's blog",
  description: "jiangruijian 的个人技术博客，记录开发路上的思考与实践。",
  url: siteUrl.replace(/\/+$/, ""), // 去掉末尾斜杠，方便拼路径
} as const;

/** 把站内路径拼成绝对 URL，如 absUrl("/posts") */
export function absUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}
