import type { MetadataRoute } from "next";
import { allPublishedPosts, listPublicTagsWithCounts } from "@/lib/db/queries";
import { absUrl } from "@/lib/site";
import { toDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, tags] = await Promise.all([allPublishedPosts(), listPublicTagsWithCounts()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absUrl("/posts"), changeFrequency: "daily", priority: 0.8 },
    { url: absUrl("/tags"), changeFrequency: "weekly", priority: 0.7 },
    { url: absUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absUrl(`/posts/${post.slug}`),
    lastModified: toDate(post.updatedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // sitemap 只输出公开（is_active = true）且至少关联一篇已发布文章的标签（§9），URL 用 slug
  const tagRoutes: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: absUrl(`/tags/${encodeURIComponent(tag.slug)}`),
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...postRoutes, ...tagRoutes];
}
