import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { count, eq, desc } from "drizzle-orm";
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

// 前台列表：只取已发布，分页
export async function listPublishedPosts(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(posts)
    .where(eq(posts.published, true));

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
