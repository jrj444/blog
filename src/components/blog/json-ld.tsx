import { siteConfig, absUrl } from "@/lib/site";
import { getLatestPublishedPost } from "@/lib/db/queries";

/**
 * 全站级 Schema.org 结构化数据 (JSON-LD)
 * 向 Google / 百度等搜索引擎提供标准的机器可读数据：
 * 1. WebSite (站点名称、检索入口 SitelinksSearchBox)
 * 2. Person (博主身份与社交账号关联)
 * 3. SiteNavigationElement (核心频道入口，含最新文章动态挂载，促成知乎式 Sitelinks 分行子链)
 */
export async function GlobalJsonLd() {
  const latestPost = await getLatestPublishedPost();

  const navigationItems = [
    ...(latestPost
      ? [
          {
            "@type": "SiteNavigationElement",
            position: 1,
            name: `最新文章：${latestPost.title}`,
            description: latestPost.excerpt || "阅读博主最新发布的个人博客与日常随笔",
            url: absUrl(`/posts/${encodeURIComponent(latestPost.slug)}`),
          },
        ]
      : []),
    {
      "@type": "SiteNavigationElement",
      position: latestPost ? 2 : 1,
      name: "文章归档",
      description: "全站技术博客、日常随笔与学习笔记归档",
      url: absUrl("/posts"),
    },
    {
      "@type": "SiteNavigationElement",
      position: latestPost ? 3 : 2,
      name: "标签分类",
      description: "按标签分类浏览所有文章",
      url: absUrl("/tags"),
    },
    {
      "@type": "SiteNavigationElement",
      position: latestPost ? 4 : 3,
      name: "关于我",
      description: "博主介绍、技术经历与联系方式",
      url: absUrl("/about"),
    },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": absUrl("/#website"),
        url: siteConfig.url,
        name: siteConfig.title,
        alternateName: [siteConfig.name, "jiangruijian.com", "蒋睿健的个人博客"],
        description: siteConfig.description,
        inLanguage: "zh-CN",
        publisher: {
          "@id": absUrl("/#person"),
        },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteConfig.url}/posts?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Person",
        "@id": absUrl("/#person"),
        name: siteConfig.author.name,
        url: siteConfig.url,
        sameAs: [siteConfig.author.github],
        jobTitle: "Software Engineer",
        description: siteConfig.slogan.zh,
      },
      {
        "@type": "ItemList",
        "@id": absUrl("/#navigation"),
        name: "站点核心导航",
        itemListElement: navigationItems,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
