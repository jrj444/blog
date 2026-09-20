"use server";

import { searchPublishedPosts } from "@/lib/db/queries";
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
 * 前台全局即时搜索 Server Action。
 * 调用不带缓存的 searchPublishedPosts，保证刚发布的文章立即可被搜索到。
 */
export async function searchPublishedPostsAction(rawQuery: string): Promise<SearchResultItem[]> {
  const query = rawQuery.trim();
  if (!query) {
    return [];
  }

  const posts = await searchPublishedPosts(query, 8);

  return posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tags,
    readingMinutes: post.readingMinutes,
    date: formatDate(post.createdAt),
  }));
}

