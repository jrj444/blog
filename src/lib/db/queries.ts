import { unstable_cache } from "next/cache";
import { db, queryWithRetry } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import {
  count,
  eq,
  ne,
  and,
  or,
  ilike,
  arrayContains,
  desc,
  asc,
  lt,
  gt,
  sql,
  type SQL,
} from "drizzle-orm";
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
  // 再套一层连接级重试：偶发断连不该让前台页面直接 500
  return unstable_cache(
    (...args: TArgs) => queryWithRetry(() => fn(...args)),
    [POSTS_CACHE_TAG, name],
    {
      tags: [POSTS_CACHE_TAG],
      revalidate: 60,
    },
  );
}

// ---------- 后台查询（不缓存） ----------

export type ListPostsParams = {
  page?: number;
  pageSize?: number;
  status?: "all" | "published" | "draft";
  q?: string;
};

// 后台列表：支持状态筛选（全部/已发布/草稿）、搜索、分页
export async function listPosts(paramsOrPage: ListPostsParams | number = 1, maybePageSize = 10) {
  const options: ListPostsParams =
    typeof paramsOrPage === "number"
      ? { page: paramsOrPage, pageSize: maybePageSize }
      : paramsOrPage;
  const { page = 1, pageSize = 10, status = "all", q } = options;

  return queryWithRetry(async () => {
    const offset = (page - 1) * pageSize;
    const search = normalizeSearchTerm(q);
    const pattern = search ? `%${escapeLike(search.term)}%` : null;

    // 1) 全局各状态总数（不受 status / search 影响，供 Tab 徽章展示）
    const countRows = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where ${posts.published})::int as published,
        count(*) filter (where not ${posts.published})::int as draft
      from ${posts}
    `);
    const countRow = firstRow(countRows as ReadonlyArray<Record<string, number>>);
    const counts = {
      all: countRow?.total ?? 0,
      published: countRow?.published ?? 0,
      draft: countRow?.draft ?? 0,
    };

    // 2) 组装当前筛选条件
    const conditions: SQL[] = [];
    if (status === "published") {
      conditions.push(eq(posts.published, true));
    } else if (status === "draft") {
      conditions.push(eq(posts.published, false));
    }

    if (pattern) {
      conditions.push(
        or(
          ilike(posts.title, pattern),
          ilike(posts.slug, pattern),
          ilike(posts.excerpt, pattern),
        ) as SQL,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // 3) 分页数据 + 当前筛选 total 并发执行（两条查询同时发出，无串行等待）。
    //    使用 Drizzle ORM .select() 而非 db.execute()，确保列名自动映射为 camelCase
    //    （db.execute 返回原始 snake_case 列名，会导致 createdAt 等字段 undefined → Invalid Date）。
    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(pageSize).offset(offset),
      db.select({ value: count() }).from(posts).where(where),
    ]);

    return {
      posts: rows,
      total,
      counts,
      page,
      pageSize,
      hasMore: offset + rows.length < total,
    };
  });
}



// 后台编辑页：按 id 取（含草稿）
export function getPostById(id: string) {
  return queryWithRetry(() => db.query.posts.findFirst({ where: eq(posts.id, id) }));
}

// 后台仪表盘：最近更新的文章（含草稿），按更新时间倒序
export function listRecentPosts(limit = 5) {
  return queryWithRetry(() => db.select().from(posts).orderBy(desc(posts.updatedAt)).limit(limit));
}

// 后台仪表盘：阅读量最高的前 N 篇已发布文章
export function listTopViewedPosts(limit = 5) {
  return queryWithRetry(() =>
    db
      .select()
      .from(posts)
      .where(eq(posts.published, true))
      .orderBy(desc(posts.views), desc(posts.createdAt))
      .limit(limit),
  );
}

// 后台仪表盘统计：已发表 / 草稿 / 今年发布 / 总阅读量。
// 合并为单次查询——一趟往返拿全部计数，避免多次串行 round trip。
export async function getDashboardStats() {
  return queryWithRetry(async () => {
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
  });
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

/**
 * 前台全局即时搜索（**不缓存**）。
 *
 * 与 listPublishedPosts 的区别：本函数绕过 unstable_cache，直接走 DB，
 * 保证刚发布的文章能够立即出现在搜索结果里，而不受 60s 缓存窗口影响。
 * 仅供 searchPublishedPostsAction 调用，不对外暴露完整分页结构。
 */
export async function searchPublishedPosts(
  q: string,
  limit = 8,
): Promise<PostListItem[]> {
  const search = normalizeSearchTerm(q);
  if (!search) return [];

  const pattern = `%${escapeLike(search.term)}%`;

  return queryWithRetry(async () => {
    const rows = await db
      .select(listColumns)
      .from(posts)
      .where(
        and(
          eq(posts.published, true),
          or(ilike(posts.title, pattern), ilike(posts.contentMd, pattern)) as SQL,
        ),
      )
      .orderBy(
        // 标题命中优先，再按时间倒序
        desc(sql`${posts.title} ilike ${pattern}`),
        desc(posts.createdAt),
      )
      .limit(limit);

    return rows.map(toPostListItem);
  });
}

/** 前台详情：只取已发布，草稿不可见 */
export const getPublishedPostBySlug = cached(
  "published-post-by-slug",
  async (slug: string) =>
    (await db.query.posts.findFirst({
      where: and(eq(posts.slug, slug), eq(posts.published, true)),
    })) ?? null,
);


export type PostSibling = {
  slug: string;
  title: string;
} | null;

export type PostSiblingsResult = {
  prev: PostSibling;
  next: PostSibling;
};

/**
 * 获取指定文章的上一篇与下一篇（仅限已发布）。
 * 针对当前文章的 id 查询其精准数据库 created_at，杜绝 JS Date 序列化微秒精度截断导致的自匹配问题。
 * 并显式排除当前文章自身（ne(posts.id, postId)）。
 * 上一篇（prev）：发布时间早于当前文章，按时间倒序取第 1 篇
 * 下一篇（next）：发布时间晚于当前文章，按时间正序取第 1 篇
 */
async function queryPostSiblings(postId: string): Promise<PostSiblingsResult> {
  const currentCreatedAtSql = sql`(select ${posts.createdAt} from ${posts} where ${posts.id} = ${postId}::uuid)`;

  const [prevRow] = await db
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        ne(posts.id, postId),
        or(
          lt(posts.createdAt, currentCreatedAtSql),
          and(eq(posts.createdAt, currentCreatedAtSql), sql`${posts.id} < ${postId}::uuid`),
        ),
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(1);

  const [nextRow] = await db
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        ne(posts.id, postId),
        or(
          gt(posts.createdAt, currentCreatedAtSql),
          and(eq(posts.createdAt, currentCreatedAtSql), sql`${posts.id} > ${postId}::uuid`),
        ),
      ),
    )
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(1);

  return {
    prev: prevRow ?? null,
    next: nextRow ?? null,
  };
}

export const getPostSiblings = cached("post-siblings", queryPostSiblings);

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

/**
 * 已发布文章用到的全部标签（去重，无计数）。
 * 使用 unnest + GROUP BY 在 DB 侧聚合，只传标签字符串列表到应用层，
 * 避免把全部文章的 tags 数组拉到 JS 再遍历。
 */
function queryAllTags() {
  return queryWithRetry(async () => {
    const rows = await db.execute<{ tag: string }>(sql`
      select distinct tag
      from ${posts}, unnest(${posts.tags}) as tag
      where ${posts.published}
      order by tag
    `);
    return (rows as ReadonlyArray<{ tag: string }>).map((r) => r.tag);
  });
}

/** sitemap 用：全部标签 */
export const allTags = cached("all-tags", queryAllTags);

/**
 * 标签云：从已发布文章聚合标签及数量。
 * 使用 unnest + GROUP BY 在 DB 侧计数，按数量倒序、同数量按拼音/字典序升序。
 */
function queryTagsWithCounts() {
  return queryWithRetry(async () => {
    const rows = await db.execute<{ tag: string; count: number }>(sql`
      select tag, count(*)::int as count
      from ${posts}, unnest(${posts.tags}) as tag
      where ${posts.published}
      group by tag
      order by count desc, tag
    `);
    return (rows as ReadonlyArray<{ tag: string; count: number }>).map((r) => ({
      tag: r.tag,
      count: r.count,
    }));
  });
}

/** 前台标签页用（缓存） */
export const listTagsWithCounts = cached("tags-with-counts", queryTagsWithCounts);

/** 后台仪表盘用（不缓存，管理员需要看到刚发布的数据） */
export const listTagsWithCountsUncached = queryTagsWithCounts;

// ---------- 媒体库反向引用扫描 ----------

export type MediaReference = {
  id: string;
  title: string;
  slug: string;
  isCover: boolean;
};

/** 从完整 URL 或相对路径中提取 R2 对象的规范 Key */
export function extractR2Key(urlOrPath: string): string | null {
  try {
    const trimmed = urlOrPath.trim();
    if (!trimmed) return null;
    let path = trimmed;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const u = new URL(trimmed);
      path = u.pathname;
    }
    const clean = path.replace(/^\/+/, "");
    return clean || null;
  } catch {
    return null;
  }
}

/**
 * 后台媒体库反查：在 DB 侧用 regexp_matches 提取图片 URL 并建立索引字典。
 *
 * 与旧版（拉全量 contentMd 到应用层跑正则）相比：
 * - 只传提取后的 URL 字符串，不再把整篇正文拉回应用层
 * - 正则在 PostgreSQL 侧执行，文章量增大时吞吐量更稳定
 *
 * 注意：PostgreSQL regexp_matches 加 'g' flag 对每处匹配都返回一行，
 * 用 LATERAL 展开后每行含一个捕获数组 m；m[1] 是 Markdown 图片 URL，
 * m[2] 是 <img src> URL（两个捕获组互斥，取非空那个）。
 */
export async function listMediaReferences(): Promise<Record<string, MediaReference[]>> {
  return queryWithRetry(async () => {
    // 图片 URL 正则：捕获 Markdown ![alt](url) 和 <img src="url">
    const IMG_REGEX =
      "(?:!\\[.*?\\]\\((https?://[^\\s\\)\"'<>]+|/[^\\s\\)\"'<>]+\\.[a-zA-Z0-9]+)\\)|<img\\s[^>]*src=[\"']([^\"']+)[\"'])";

    // 1) 从正文提取所有图片 URL（LATERAL + regexp_matches + 'g' flag）
    const contentRows = await db.execute(sql`
      select p.id, p.title, p.slug,
             coalesce(m[1], m[2]) as url
      from ${posts} p,
        lateral regexp_matches(p.content_md, ${IMG_REGEX}, 'g') as m
      where coalesce(m[1], m[2]) is not null
        and coalesce(m[1], m[2]) != ''
    `);

    // 2) 封面图（直接取字段，无需正则）
    const coverRows = await db
      .select({ id: posts.id, title: posts.title, slug: posts.slug, coverImage: posts.coverImage })
      .from(posts)
      .where(sql`${posts.coverImage} is not null and ${posts.coverImage} != ''`);

    const refMap: Record<string, MediaReference[]> = {};

    const addRef = (key: string, ref: MediaReference) => {
      const cleanKey = key.replace(/^\/+/, "");
      if (!cleanKey) return;
      if (!refMap[cleanKey]) refMap[cleanKey] = [];
      if (!refMap[cleanKey].some((r) => r.id === ref.id && r.isCover === ref.isCover)) {
        refMap[cleanKey].push(ref);
      }
    };

    // 处理封面图
    for (const row of coverRows) {
      if (row.coverImage) {
        const key = extractR2Key(row.coverImage);
        if (key) addRef(key, { id: row.id, title: row.title, slug: row.slug, isCover: true });
      }
    }

    // 处理正文图片
    for (const row of contentRows as ReadonlyArray<Record<string, unknown>>) {
      const url = row.url as string | null;
      if (url) {
        const key = extractR2Key(url);
        if (key) {
          addRef(key, {
            id: row.id as string,
            title: row.title as string,
            slug: row.slug as string,
            isCover: false,
          });
        }
      }
    }

    return refMap;
  });
}
