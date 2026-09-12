import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { count, eq, and, or, ilike, arrayContains, desc, sql, type SQL } from "drizzle-orm";
import { slugify, type PostInput } from "@/lib/validators/post";
import { escapeLike, normalizeSearchTerm } from "@/lib/db/search";

// ---------- 列表投影 ----------

/** 列表页只需要这些列：正文 content_md 不参与列表渲染（否则每次列表都要搬运全文）。 */
const listColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  coverImage: posts.coverImage,
  tags: posts.tags,
  published: posts.published,
  views: posts.views,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  // 阅读时长在 SQL 里算，避免为了一个「x 分钟」把整篇正文取回应用层
  charCount: sql<number>`length(regexp_replace(${posts.contentMd}, '\\s', '', 'g'))::int`,
};

type PostListRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  tags: string[];
  published: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  charCount: number;
};

/**
 * 列表项：不含正文全文。
 * PostCard / 首页列表 / 标签页用它；文章详情页才取完整 `Post`。
 */
export type PostListItem = PostListRow & {
  /** 预估阅读时长（分钟），由 charCount 推导，规则与 lib/reading-time.ts 一致 */
  readingMinutes: number;
};

const MINUTES_PER_CHAR = 350;

/** 与 lib/reading-time.ts 保持一致：不足 1 分钟按 1 分钟计 */
function toReadingMinutes(charCount: number) {
  return Math.max(1, Math.round(charCount / MINUTES_PER_CHAR));
}

function toPostListItem(row: PostListRow): PostListItem {
  return {
    ...row,
    readingMinutes: toReadingMinutes(row.charCount),
  };
}

/** postgres-js 的 db.execute 返回行数组；空结果时给个安全默认值 */
function firstRow<T>(rows: readonly T[]): T | undefined {
  return rows.length > 0 ? rows[0] : undefined;
}

// ---------- 缓存辅助 ----------

/** 文章数据的统一缓存 tag：任何写操作后 revalidateTag 即可整体失效 */
export const POSTS_CACHE_TAG = "posts";

/**
 * 包裹前台只读查询。
 *
 * 说明：本项目使用「上一代缓存模型」（next.config 未开启 cacheComponents），
 * 所以用 unstable_cache 而非 `use cache`。这些查询只服务前台公开页面；
 * 后台的 listPosts / getDashboardStats / getPostById 保持不缓存，避免管理界面看到旧数据。
 */
function cached<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
) {
  return unstable_cache(fn, [POSTS_CACHE_TAG, name], {
    tags: [POSTS_CACHE_TAG],
    revalidate: 60,
  });
}

// ---------- 后台查询（不缓存） ----------

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

// 后台编辑页：按 id 取（含草稿）
export function getPostById(id: string) {
  return db.query.posts.findFirst({ where: eq(posts.id, id) });
}

// 后台仪表盘：最近更新的文章（含草稿），按更新时间倒序
export function listRecentPosts(limit = 5) {
  return db.select().from(posts).orderBy(desc(posts.updatedAt)).limit(limit);
}

// 后台仪表盘统计：已发表 / 草稿 / 今年发布 / 总阅读量。
// 合并为单次查询——一趟往返拿全部计数，避免多次串行 round trip。
export async function getDashboardStats() {
  const rows = await db.execute(sql`
    select
      count(*) filter (where ${posts.published})::int as published,
      count(*) filter (where not ${posts.published})::int as drafts,
      count(*) filter (
        where ${posts.published}
          and extract(year from ${posts.createdAt}) = extract(year from now())
      )::int as this_year,
      coalesce(sum(${posts.views}), 0)::int as views
    from ${posts}
  `);

  const row = firstRow(rows as ReadonlyArray<Record<string, number>>);
  return {
    published: row?.published ?? 0,
    drafts: row?.drafts ?? 0,
    thisYear: row?.this_year ?? 0,
    views: row?.views ?? 0,
  };
}

// ---------- 写操作（不缓存） ----------

// 确保 slug 唯一；若已存在（且不是自己），加时间戳后缀
async function uniqueSlug(slug: string, exceptId?: string) {
  const existing = await db.query.posts.findFirst({
    where: eq(posts.slug, slug),
    columns: { id: true },
  });
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
      coverImage: input.coverImage || null,
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
      coverImage: input.coverImage || null,
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

// ---------- 前台查询（缓存） ----------

export type ListPublishedParams = {
  page?: number;
  pageSize?: number;
  tag?: string;
  q?: string;
};

export type PublishedPostsResult = {
  posts: PostListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type PublishedPostsArgs = {
  page: number;
  pageSize: number;
  tag: string | null;
  /** 归一化后的搜索词（原文，未转义）；null 表示不搜索 */
  term: string | null;
};

/**
 * 前台列表:只取已发布,支持分页 / 标签过滤 / 关键词搜索(pg_trgm)。
 * 参数归一化放在缓存外层,保证「同一语义的输入」映射到同一个缓存键。
 */
export function listPublishedPosts({
  page = 1,
  pageSize = 10,
  tag,
  q,
}: ListPublishedParams = {}): Promise<PublishedPostsResult> {
  const search = normalizeSearchTerm(q);
  return cachedListPublishedPosts({
    page,
    pageSize,
    tag: tag?.trim() || null,
    term: search?.term ?? null,
  });
}

async function queryListPublishedPosts(args: PublishedPostsArgs): Promise<PublishedPostsResult> {
  const { page, pageSize, tag, term } = args;
  const offset = (page - 1) * pageSize;

  // 转义后的 LIKE 模式：escapeLike 处理 `%` `_` `\`，避免用户输入 `%` 命中全表
  const pattern = term ? `%${escapeLike(term)}%` : null;

  const conditions: SQL[] = [eq(posts.published, true)];
  if (tag) {
    conditions.push(arrayContains(posts.tags, [tag]));
  }
  if (pattern) {
    conditions.push(or(ilike(posts.title, pattern), ilike(posts.contentMd, pattern)) as SQL);
  }
  const where = and(...conditions);

  const rows = await db
    .select(listColumns)
    .from(posts)
    .where(where)
    .orderBy(
      // 搜索时标题命中优先,再按时间倒序;非搜索按时间倒序
      ...(pattern ? [desc(sql`${posts.title} ilike ${pattern}`)] : []),
      desc(posts.createdAt),
    )
    .limit(pageSize)
    .offset(offset);

  const [{ value: total }] = await db.select({ value: count() }).from(posts).where(where);

  return {
    posts: rows.map(toPostListItem),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  };
}

const cachedListPublishedPosts = cached("list-published", queryListPublishedPosts);

/** 前台详情：只取已发布，草稿不可见 */
export const getPublishedPostBySlug = cached(
  "published-post-by-slug",
  async (slug: string) =>
    (await db.query.posts.findFirst({
      where: and(eq(posts.slug, slug), eq(posts.published, true)),
    })) ?? null,
);

/**
 * 首页统计：总数 / 本年发布数 / 最近更新时间（单次查询）。
 *
 * 注意：`lastUpdated` 返回 **ISO 字符串**而不是 Date——unstable_cache 会序列化返回值，
 * Date 过缓存边界后会变成字符串。跨缓存边界只传原始类型，调用方需要时再 new Date() 还原。
 */
export const getPublishedStats = cached("published-stats", async () => {
  const rows = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (
        where extract(year from ${posts.createdAt}) = extract(year from now())
      )::int as this_year,
      max(${posts.updatedAt}) as last_updated
    from ${posts}
    where ${posts.published}
  `);

  const row = firstRow(rows as ReadonlyArray<Record<string, unknown>>);
  const lastUpdated = row?.last_updated;

  return {
    total: typeof row?.total === "number" ? row.total : 0,
    thisYear: typeof row?.this_year === "number" ? row.this_year : 0,
    lastUpdated: lastUpdated ? new Date(lastUpdated as string | Date).toISOString() : null,
  };
});

/** sitemap / RSS：全部已发布文章（RSS 需要正文做 content:encoded） */
export const allPublishedPosts = cached("all-published", () =>
  db.select().from(posts).where(eq(posts.published, true)).orderBy(desc(posts.createdAt)),
);

/** 已发布文章用到的全部标签（去重，无计数） */
async function queryAllTags() {
  const rows = await db.select({ tags: posts.tags }).from(posts).where(eq(posts.published, true));
  const set = new Set<string>();
  for (const row of rows) {
    for (const tag of row.tags) set.add(tag);
  }
  return [...set];
}

/** sitemap 用：全部标签 */
export const allTags = cached("all-tags", queryAllTags);

/** 标签云:从已发布文章聚合标签及数量 */
async function queryTagsWithCounts() {
  const rows = await db.select({ tags: posts.tags }).from(posts).where(eq(posts.published, true));
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

/** 前台标签页用（缓存） */
export const listTagsWithCounts = cached("tags-with-counts", queryTagsWithCounts);

/** 后台仪表盘用（不缓存，管理员需要看到刚发布的数据） */
export const listTagsWithCountsUncached = queryTagsWithCounts;
