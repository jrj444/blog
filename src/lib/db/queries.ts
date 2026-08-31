import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { count, eq, and, or, ilike, arrayContains, desc, sql } from "drizzle-orm";
import { slugify, type PostInput } from "@/lib/validators/post";

// 后台列表：全部（含草稿），分页
export async function listPosts(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select()
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ value: total }] = await db.select({ value: count() }).from(posts);

  return {
    posts: rows,
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  };
}

// 前台列表:只取已发布,支持分页 / 标签过滤 / 关键词搜索(pg_trgm)
export type ListPublishedParams = {
  page?: number;
  pageSize?: number;
  tag?: string;
  q?: string;
};

export async function listPublishedPosts(params: ListPublishedParams = {}) {
  const { page = 1, pageSize = 10, tag, q } = params;
  const offset = (page - 1) * pageSize;
  const term = q?.trim();

  const conditions = [eq(posts.published, true)];
  if (tag) {
    conditions.push(arrayContains(posts.tags, [tag]));
  }
  if (term) {
    conditions.push(
      or(ilike(posts.title, `%${term}%`), ilike(posts.contentMd, `%${term}%`))!,
    );
  }
  const where = and(...conditions);

  const rows = await db
    .select()
    .from(posts)
    .where(where)
    .orderBy(
      // 搜索时标题命中优先,再按时间倒序;非搜索按时间倒序
      term ? desc(sql`${posts.title} ilike ${`%${term}%`}`) : desc(posts.createdAt),
      desc(posts.createdAt),
    )
    .limit(pageSize)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(posts)
    .where(where);

  return {
    posts: rows,
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  };
}

export function getPostById(id: string) {
  return db.query.posts.findFirst({ where: eq(posts.id, id) });
}

export function getPostBySlug(slug: string) {
  return db.query.posts.findFirst({ where: eq(posts.slug, slug) });
}

// 前台详情：只取已发布，草稿不可见
export function getPublishedPostBySlug(slug: string) {
  return db.query.posts.findFirst({
    where: and(eq(posts.slug, slug), eq(posts.published, true)),
  });
}

// 确保 slug 唯一；若已存在（且不是自己），加时间戳后缀
async function uniqueSlug(slug: string, exceptId?: string) {
  const existing = await getPostBySlug(slug);
  if (existing && existing.id !== exceptId) {
    return `${slug}-${Date.now().toString(36)}`;
  }
  return slug;
}

export async function createPost(input: PostInput) {
  const slug = await uniqueSlug(input.slug || slugify(input.title));

  const [row] = await db
    .insert(posts)
    .values({
      title: input.title,
      slug,
      excerpt: input.excerpt || null,
      contentMd: input.contentMd,
      tags: input.tags,
      published: input.published,
      coverImage: null,
    })
    .returning({ id: posts.id });

  return row;
}

export async function updatePost(id: string, input: PostInput) {
  const slug = await uniqueSlug(input.slug || slugify(input.title), id);

  const [row] = await db
    .update(posts)
    .set({
      title: input.title,
      slug,
      excerpt: input.excerpt || null,
      contentMd: input.contentMd,
      tags: input.tags,
      published: input.published,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id))
    .returning({ id: posts.id });

  return row;
}

export async function deletePost(id: string) {
  await db.delete(posts).where(eq(posts.id, id));
}

// 阅读量 +1:走 security definer RPC(仅已发布文章生效,RLS 安全)
export async function incrementViews(postId: string) {
  await db.execute(sql`select public.increment_post_views(${postId}::uuid)`);
}
