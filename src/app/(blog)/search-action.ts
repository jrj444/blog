"use server";

import { listPublishedPosts } from "@/lib/db/queries";
import { formatDate } from "@/lib/format-date";

export type SearchResultItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[];
  readingMinutes: number;
  date: string;
};

/**
 * 前台全局即时搜索 Server Action：
 * 输入关键词，调用带 pg_trgm / ilike 模糊查询的 listPublishedPosts，
 * 仅检索已发布文章并返回最相关的至多 8 篇摘要信息。
 */
export async function searchPublishedPostsAction(rawQuery: string): Promise<SearchResultItem[]> {
  const query = rawQuery.trim();
  if (!query) {
    return [];
  }

  // listPublishedPosts 内部会调用 normalizeSearchTerm 过滤无效字符并转义
  const result = await listPublishedPosts({
    page: 1,
    pageSize: 8,
    q: query,
  });

  return result.posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tags,
    readingMinutes: post.readingMinutes,
    date: formatDate(post.createdAt),
  }));
}
