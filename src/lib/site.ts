// 站点级配置：供 sitemap / robots / RSS / 根布局 metadata 共用。
// 生产部署请设置 SITE_URL（正式域名）；否则回退到 AUTH_URL，再回退本地。
const siteUrl = process.env.SITE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

export const siteConfig = {
  name: "JIANG RUIJIAN",
  title: "JIANG RUIJIAN 的个人博客",
  description:
    "JIANG RUIJIAN 的个人博客，记录日常与学习，分享生活思考与随笔。人生不可重来，贪婪有何不可。",
  slogan: {
    zh: "人生不可重来，贪婪有何不可。",
    en: "Life cannot be replayed, so why not be greedy",
  },
  keywords: ["JIANG RUIJIAN", "个人博客", "学习笔记", "日常随笔", "生活记录", "技术思考"],
  author: {
    name: "JIANG RUIJIAN",
    url: siteUrl.replace(/\/+$/, ""),
    github: "https://github.com/jrj444",
  },
  url: siteUrl.replace(/\/+$/, ""), // 去掉末尾斜杠，方便拼路径
} as const;

/** 把站内路径拼成绝对 URL，如 absUrl("/posts") */
export function absUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}
