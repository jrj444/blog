import type { MetadataRoute } from "next";
import { allPublishedPosts, allTags } from "@/lib/db/queries";
import { absUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, tags] = await Promise.all([allPublishedPosts(), allTags()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absUrl("/posts"), changeFrequency: "daily", priority: 0.8 },
    { url: absUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absUrl(`/posts/${post.slug}`),
    lastModified: post.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const tagRoutes: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: absUrl(`/tags/${encodeURIComponent(tag)}`),
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...postRoutes, ...tagRoutes];
}
