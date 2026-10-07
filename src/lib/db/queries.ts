import { unstable_cache } from "next/cache";
import { db, queryWithRetry } from "@/lib/db";
import { postTags, posts, tags, type Post } from "@/lib/db/schema";
import {
  count,
  eq,
  ne,
  and,
  or,
  ilike,
  inArray,
  desc,
  asc,
  lt,
  gt,
  sql,
  type SQL,
} from "drizzle-orm";
import { slugify, type PostInput, type PostTagInput } from "@/lib/validators/post";
import { normalizeTagKey, normalizeTagName } from "@/lib/tags/normalize";
import { buildTagSlug, normalizeManualTagSlug, withTagSlugSuffix } from "@/lib/tags/slug";
import { escapeLike, normalizeSearchTerm } from "@/lib/db/search";
import { MINUTES_PER_CHAR } from "@/lib/reading-time";

// ---------- 列表投影 ----------

/**
 * 列表页的标签投影：join post_tags + tags 聚合成 TagSummary[]（§11.1）。
 * 只含启用标签——前台徽章/标签云/keywords 都不出现停用标签（§7.5）。
 */
const activeTagsPerPost = sql<TagSummary[]>`coalesce((
  select json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug) order by pt.position)
  from ${postTags} pt
  join ${tags} t on t.id = pt.tag_id
  where pt.post_id = ${posts.id} and t.is_active
), '[]'::json)`;

/** 列表页只需要这些列：正文 content_md 不参与列表渲染（否则每次列表都要搬运全文）。 */
const listColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  coverImage: posts.coverImage,
  tags: activeTagsPerPost,
  published: posts.published,
  publishedAt: posts.publishedAt,
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
  tags: TagSummary[];
  published: boolean;
  publishedAt: Date | null;
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

// ---------- 标签类型（§11） ----------

export type TagSummary = {
  id: string;
  name: string;
  slug: string;
};

/** 后台候选/回显用：带启用状态（含停用标签） */
export type TagOption = TagSummary & { isActive: boolean };

/** /tags/[slug] 路由参数解析结果（§6.3） */
export type ResolvedTag = TagSummary & { description: string | null; isActive: boolean };

/** 前台标签页 / sitemap / 首页 chips：公开标签 + 已发布文章数 */
export type TagSummaryWithCount = TagSummary & { description: string | null; count: number };

/** 文章详情（前台）：tags 只含启用标签 */
export type PostDetail = Post & { tags: TagSummary[] };

/** 文章详情（后台编辑）：tags 含停用标签，供编辑器回显（§8.2 规则 2） */
export type PostDetailAdmin = Post & { tags: TagOption[] };

/** 阅读时长口径统一走 lib/reading-time.ts（SQL 侧 length() 按字符数，与 JS 一致） */
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
    // 显式投影：content_md 不参与列表渲染（复制按钮点击时经 Server Action 惰性取文）
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          id: posts.id,
          slug: posts.slug,
          title: posts.title,
          excerpt: posts.excerpt,
          coverImage: posts.coverImage,
          published: posts.published,
          publishedAt: posts.publishedAt,
          views: posts.views,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .where(where)
        .orderBy(desc(posts.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(posts).where(where),
    ]);

    // 标签走关系表批量取（含停用，后台可标注）
    const postIds = rows.map((row) => row.id);
    const tagsByPost = new Map<string, TagOption[]>();
    if (postIds.length > 0) {
      const tagRows = await db
        .select({
          postId: postTags.postId,
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          isActive: tags.isActive,
        })
        .from(postTags)
        .innerJoin(tags, eq(tags.id, postTags.tagId))
        .where(inArray(postTags.postId, postIds))
        .orderBy(postTags.position);
      for (const { postId, ...tag } of tagRows) {
        const list = tagsByPost.get(postId) ?? [];
        list.push(tag);
        tagsByPost.set(postId, list);
      }
    }

    return {
      posts: rows.map((row) => ({
        ...row,
        // 标签来自关系表批量查询（旧标签数组列已随 P5 删除）
        tags: tagsByPost.get(row.id) ?? [],
      })),
      total,
      counts,
      page,
      pageSize,
      hasMore: offset + rows.length < total,
    };
  });
}

// 后台编辑页：按 id 取（含草稿）。标签改从关系表取（含停用标签，供编辑器回显 §8.2 规则 2）
export async function getPostById(id: string): Promise<PostDetailAdmin | undefined> {
  return queryWithRetry(async () => {
    const post = await db.query.posts.findFirst({ where: eq(posts.id, id) });
    if (!post) return undefined;
    const tagRows = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug, isActive: tags.isActive })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(eq(postTags.postId, post.id))
      .orderBy(postTags.position);
    return { ...post, tags: tagRows };
  });
}

// 后台仪表盘：最近更新的文章（含草稿），按更新时间倒序
export function listRecentPosts(limit = 5) {
  return queryWithRetry(() =>
    db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        published: posts.published,
        views: posts.views,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .orderBy(desc(posts.updatedAt))
      .limit(limit),
  );
}

// 后台仪表盘：阅读量最高的前 N 篇已发布文章
export function listTopViewedPosts(limit = 5) {
  return queryWithRetry(() =>
    db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        views: posts.views,
        createdAt: posts.createdAt,
      })
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
            and ${posts.publishedAt} is not null
            and extract(year from ${posts.publishedAt}) = extract(year from now())
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

/**
 * 标签解析/写入的可恢复业务错误：信息面向用户，actions 层转成 tags 字段级错误，
 * 不得静默丢弃标签（§8.1 / §8.2 规则 3）。
 */
export class TagWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagWriteError";
  }
}

type TagTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type TagRow = { id: string; name: string; normalizedKey: string; isActive: boolean };

const tagColumns = {
  id: tags.id,
  name: tags.name,
  normalizedKey: tags.normalizedKey,
  isActive: tags.isActive,
};

/**
 * 事务内创建新标签（§8.2 规则 3、7）。
 * 不带 target 的 `on conflict do nothing` 同时覆盖 normalized_key 与 slug 两个唯一约束
 * （一条 INSERT 只能写一个 ON CONFLICT 子句，§20.4）：插入成功返回新行；插入无效时按
 * normalized_key 回查——命中 = 并发方已建（复用），未命中 = slug 被占，换后缀重试。
 * 注意：事务内不得套 queryWithRetry（写操作重试会重复建标签，§8.2 规则 7）。
 */
async function createTagInTx(tx: TagTx, name: string, key: string): Promise<TagRow> {
  const displayName = normalizeTagName(name);
  const base = buildTagSlug(displayName);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const slug = withTagSlugSuffix(base, attempt);
    const inserted = await tx
      .insert(tags)
      .values({ name: displayName, normalizedKey: key, slug })
      .onConflictDoNothing()
      .returning(tagColumns);
    if (inserted.length > 0) return inserted[0];
    const [hit] = await tx
      .select(tagColumns)
      .from(tags)
      .where(eq(tags.normalizedKey, key))
      .limit(1);
    if (hit) return hit;
  }
  throw new TagWriteError("标签创建冲突，请稍后重试");
}

/**
 * 把表单提交的标签解析成 tag_id 列表（保持提交顺序，position 即顺序，§8.2 规则 1-3）。
 *
 * @param originallyAssociated 该文章现有的 tag_id 集合（新建文章传空集合）。
 *   停用标签仅在「文章原本就有关联」时允许保留；未命中此条件（含 name 命中已有停用标签）
 *   必须拒绝并提示，不得静默创建第二行同名标签（§8.2 规则 2/3）。
 */
async function resolvePostTags(
  tx: TagTx,
  inputs: PostTagInput[],
  originallyAssociated: ReadonlySet<string>,
): Promise<{ tagId: string; position: number }[]> {
  // 1) 批量取候选：带 id 的按 id 查，带 name 的按 normalized_key 查（包含停用标签）
  const ids = inputs.flatMap((input) => ("id" in input ? [input.id] : []));
  const keys = [
    ...new Set(inputs.flatMap((input) => ("name" in input ? [normalizeTagKey(input.name)] : []))),
  ].filter(Boolean);

  const byId = new Map<string, TagRow>();
  const byKey = new Map<string, TagRow>();
  if (ids.length > 0) {
    const rows = await tx.select(tagColumns).from(tags).where(inArray(tags.id, ids));
    for (const row of rows) byId.set(row.id, row);
  }
  if (keys.length > 0) {
    const rows = await tx.select(tagColumns).from(tags).where(inArray(tags.normalizedKey, keys));
    for (const row of rows) byKey.set(row.normalizedKey, row);
  }

  // 2) 按提交顺序解析，按 normalized_key 去重（React 与 REACT 只留先出现的一个，规则 1）
  const resolved: { tagId: string; position: number }[] = [];
  const seenKeys = new Set<string>();
  for (const input of inputs) {
    let tag: TagRow;
    let key: string;
    if ("id" in input) {
      const hit = byId.get(input.id);
      if (!hit) throw new TagWriteError("所选标签不存在或已被删除，请刷新后重试");
      tag = hit;
      key = hit.normalizedKey;
    } else {
      const name = normalizeTagName(input.name);
      key = normalizeTagKey(name);
      if (!key) throw new TagWriteError(`标签名称无效：「${input.name}」`);
      const hit = byKey.get(key);
      tag = hit ?? (await createTagInTx(tx, name, key));
      byKey.set(key, tag);
    }
    if (seenKeys.has(key)) continue;
    if (!tag.isActive && !originallyAssociated.has(tag.id)) {
      throw new TagWriteError(`标签「${tag.name}」已停用，请先在标签管理里启用，或换一个标签`);
    }
    seenKeys.add(key);
    resolved.push({ tagId: tag.id, position: resolved.length });
  }
  return resolved;
}

/**
 * 事务内同步文章标签：「先读旧、再 diff」，**禁止全删重建**——那会重置
 * post_tags.created_at（首次关联时间，§8.2 规则 4）。同一篇文章的并发编辑是
 * last-write-wins（V1 接受，不加行锁）。
 */
async function syncPostTags(
  tx: TagTx,
  postId: string,
  inputs: PostTagInput[],
  originallyAssociated: ReadonlySet<string>,
): Promise<void> {
  const resolved = await resolvePostTags(tx, inputs, originallyAssociated);
  const nextIds = new Set(resolved.map((r) => r.tagId));

  // 移除：旧集合有、提交里没有
  const removed = [...originallyAssociated].filter((tagId) => !nextIds.has(tagId));
  if (removed.length > 0) {
    await tx
      .delete(postTags)
      .where(and(eq(postTags.postId, postId), inArray(postTags.tagId, removed)));
  }

  // 保留：只更新 position（不动 created_at）；新增：插入
  const inserts: { postId: string; tagId: string; position: number }[] = [];
  for (const { tagId, position } of resolved) {
    if (originallyAssociated.has(tagId)) {
      await tx
        .update(postTags)
        .set({ position })
        .where(and(eq(postTags.postId, postId), eq(postTags.tagId, tagId)));
    } else {
      inserts.push({ postId, tagId, position });
    }
  }
  if (inserts.length > 0) {
    // on conflict do nothing：并发保存撞主键时按幂等处理，避免把唯一约束错误抛给用户
    await tx.insert(postTags).values(inserts).onConflictDoNothing();
  }
}

export async function createPost(input: PostInput) {
  const slug = await uniqueSlug(input.slug || slugify(input.title));

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(posts)
      .values({
        title: input.title,
        slug,
        excerpt: input.excerpt || null,
        contentMd: input.contentMd,
        published: input.published,
        coverImage: input.coverImage || null,
        // §5.3：发布时留空由服务端填 now()，草稿留 NULL；旧标签数组列不再写入（硬切，§13.3）
        publishedAt: input.published
          ? (input.publishedAt ?? new Date())
          : (input.publishedAt ?? null),
      })
      .returning({ id: posts.id });

    await syncPostTags(tx, row.id, input.tags, new Set());
    return row;
  });
}

export async function updatePost(id: string, input: PostInput) {
  const slug = await uniqueSlug(input.slug || slugify(input.title), id);

  return db.transaction(async (tx) => {
    // 先读旧关联：既是 diff 的基准，也是「停用标签原本就有关联」的判定依据（§8.2 规则 2/4）
    const oldRows = await tx
      .select({ tagId: postTags.tagId })
      .from(postTags)
      .where(eq(postTags.postId, id));
    const originallyAssociated = new Set(oldRows.map((row) => row.tagId));

    const patch: Partial<typeof posts.$inferInsert> = {
      title: input.title,
      slug,
      excerpt: input.excerpt || null,
      contentMd: input.contentMd,
      published: input.published,
      coverImage: input.coverImage || null,
      updatedAt: new Date(),
    };
    if (input.published) {
      // 发布：按表单值，留空填 now()（§5.3）
      patch.publishedAt = input.publishedAt ?? new Date();
    } else if (input.publishedAt !== undefined) {
      // 撤稿/存草稿：表单显式提交的时间照存（含 null = 清空）；
      // undefined（过渡期表单还没有该字段）→ 不写 published_at，保留原值（§5.3）
      patch.publishedAt = input.publishedAt;
    }

    const [row] = await tx
      .update(posts)
      .set(patch)
      .where(eq(posts.id, id))
      .returning({ id: posts.id });
    if (!row) return row;

    await syncPostTags(tx, id, input.tags, originallyAssociated);
    return row;
  });
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
  /** 已解析的标签 id（§6.3 由 resolvePublicTag 得到）；按 tag_id 过滤不再按名称匹配数组列 */
  tagId?: string;
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
  tagId: string | null;
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
  tagId,
  q,
}: ListPublishedParams = {}): Promise<PublishedPostsResult> {
  const search = normalizeSearchTerm(q);
  return cachedListPublishedPosts({
    page,
    pageSize,
    tagId: tagId?.trim() || null,
    term: search?.term ?? null,
  });
}

async function queryListPublishedPosts(args: PublishedPostsArgs): Promise<PublishedPostsResult> {
  const { page, pageSize, tagId, term } = args;
  const offset = (page - 1) * pageSize;

  // 转义后的 LIKE 模式：escapeLike 处理 `%` `_` `\`，避免用户输入 `%` 命中全表
  const pattern = term ? `%${escapeLike(term)}%` : null;

  const conditions: SQL[] = [eq(posts.published, true)];
  if (tagId) {
    // 按关系表过滤（§11.1）：不再 arrayContains 数组列
    conditions.push(
      sql`exists (select 1 from ${postTags} where ${postTags.postId} = ${posts.id} and ${postTags.tagId} = ${tagId})`,
    );
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
      // 搜索时标题命中优先;非搜索按发布时间倒序（发布时间即前台时间线）
      ...(pattern ? [desc(sql`${posts.title} ilike ${pattern}`)] : []),
      desc(posts.publishedAt),
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
export async function searchPublishedPosts(q: string, limit = 8): Promise<PostListItem[]> {
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
        // 标题命中优先，再按发布时间倒序
        desc(sql`${posts.title} ilike ${pattern}`),
        desc(posts.publishedAt),
      )
      .limit(limit);

    return rows.map(toPostListItem);
  });
}

/**
 * 前台详情：只取已发布，草稿不可见。
 * 标签改从关系表取：只含启用标签（前台徽章/keywords 不输出停用标签，§7.5/§9）。
 */
export const getPublishedPostBySlug = cached(
  "published-post-by-slug",
  async (slug: string): Promise<PostDetail | null> => {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.slug, slug), eq(posts.published, true)),
    });
    if (!post) return null;
    const tagRows = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(and(eq(postTags.postId, post.id), eq(tags.isActive, true)))
      .orderBy(postTags.position);
    return { ...post, tags: tagRows };
  },
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
 * 获取指定文章的上一篇与下一篇（仅限已发布），按发布时间线排序（published_at）。
 * 针对当前文章的 id 查询其精准数据库 published_at，杜绝 JS Date 序列化微秒精度截断导致的自匹配问题。
 * 并显式排除当前文章自身（ne(posts.id, postId)）。
 * 上一篇（prev）：发布时间早于当前文章，按时间倒序取第 1 篇
 * 下一篇（next）：发布时间晚于当前文章，按时间正序取第 1 篇
 * 已发布文章的 published_at 由应用层保证非空（§5.3），NULL 行在比较中自然落选。
 */
async function queryPostSiblings(postId: string): Promise<PostSiblingsResult> {
  const currentPublishedAtSql = sql`(select ${posts.publishedAt} from ${posts} where ${posts.id} = ${postId}::uuid)`;

  const [prevRow] = await db
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        ne(posts.id, postId),
        or(
          lt(posts.publishedAt, currentPublishedAtSql),
          and(eq(posts.publishedAt, currentPublishedAtSql), sql`${posts.id} < ${postId}::uuid`),
        ),
      ),
    )
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(1);

  const [nextRow] = await db
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        ne(posts.id, postId),
        or(
          gt(posts.publishedAt, currentPublishedAtSql),
          and(eq(posts.publishedAt, currentPublishedAtSql), sql`${posts.id} > ${postId}::uuid`),
        ),
      ),
    )
    .orderBy(asc(posts.publishedAt), asc(posts.id))
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
        where ${posts.publishedAt} is not null
          and extract(year from ${posts.publishedAt}) = extract(year from now())
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

/** sitemap 用：只需要 slug 与更新时间，不拉正文 */
export const allPublishedPostMeta = cached("published-post-meta", () =>
  db
    .select({ slug: posts.slug, updatedAt: posts.updatedAt })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt)),
);

/** RSS：全部已发布文章全文（content:encoded），上限 50 条防超大库拖垮 feed */
export const allPublishedPosts = cached("all-published", () =>
  db
    .select()
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(50),
);

/** 后台复制按钮：惰性取单篇正文（不拉进列表查询与 RSC payload） */
export async function getPostContentById(id: string): Promise<string | null> {
  return queryWithRetry(async () => {
    const [row] = await db
      .select({ contentMd: posts.contentMd })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);
    return row?.contentMd ?? null;
  });
}

/** 前台复制按钮：按 slug 惰性取已发布文章正文（公开数据，走缓存） */
export const getPublishedPostContentBySlug = cached(
  "published-post-content-by-slug",
  (slug: string) =>
    queryWithRetry(async () => {
      const [row] = await db
        .select({ contentMd: posts.contentMd })
        .from(posts)
        .where(and(eq(posts.slug, slug), eq(posts.published, true)))
        .limit(1);
      return row?.contentMd ?? null;
    }),
);

/**
 * 公开标签及已发布文章数（§9）：只含启用标签，count = 关联的已发布文章数，
 * 按文章数倒序、名称升序。前台标签页 / sitemap / 首页 chips / 后台仪表盘共用。
 */
function queryPublicTagsWithCounts(): Promise<TagSummaryWithCount[]> {
  return queryWithRetry(async () => {
    const rows = await db.execute(sql`
      select t.id, t.name, t.slug, t.description, count(p.id)::int as count
      from ${tags} t
      join ${postTags} pt on pt.tag_id = t.id
      join ${posts} p on p.id = pt.post_id and p.published = true
      where t.is_active
      group by t.id, t.name, t.slug, t.description
      order by count desc, t.name
    `);
    return (
      rows as unknown as ReadonlyArray<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        count: number;
      }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      count: row.count,
    }));
  });
}

/** 前台标签页 / sitemap / 首页 chips 用（缓存） */
export const listPublicTagsWithCounts = cached(
  "public-tags-with-counts",
  queryPublicTagsWithCounts,
);

/** 后台仪表盘用（不缓存，管理员需要看到刚发布的数据） */
export const listPublicTagsWithCountsUncached = queryPublicTagsWithCounts;

/**
 * 解码 /tags/[slug] 的路由参数。
 *
 * 实测 Next 16.3.3：同一次请求里 generateMetadata 拿到的 params 已解码，
 * 页面本体拿到的仍是百分号编码串（如 `%E5%AF%B9…`）——直接查库会 404。
 * 这里统一解码一次；畸形 % 序列按原值处理，解码前后一致时无副作用。
 */
export function decodeRouteParam(value: string): string {
  try {
    const decoded = decodeURIComponent(value);
    return decoded === value ? value : decoded;
  } catch {
    return value;
  }
}

/**
 * 解析 /tags/[slug] 的路由参数（§6.3）：
 * 1. 入参解码后 toLowerCase() 精确匹配 tags.slug——slug 全小写存储；不要用 lower(tags.slug)
 *    比较，那会绕开唯一索引；
 * 2. 未命中时把 URL 参数按标签名称归一化，匹配 normalized_key（兼容迁移前的名称型旧
 *    URL，只回退一次、不追历史链）；
 * 3. 后续动作由页面决定：停用或不存在 → 404；最终地址与当前 URL 不同 → permanentRedirect。
 */
export const resolvePublicTag = cached(
  "resolve-public-tag",
  async (routeValue: string): Promise<ResolvedTag | null> => {
    // 解码后再匹配：页面本体与 metadata 收到的 params 编码状态可能不同
    const input = decodeRouteParam(routeValue);
    const columns = {
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      description: tags.description,
      isActive: tags.isActive,
    };
    const [bySlug] = await db
      .select(columns)
      .from(tags)
      .where(eq(tags.slug, input.toLowerCase()))
      .limit(1);
    if (bySlug) return bySlug;
    const key = normalizeTagKey(input);
    if (!key) return null;
    const [byKey] = await db.select(columns).from(tags).where(eq(tags.normalizedKey, key)).limit(1);
    return byKey ?? null;
  },
);

// ---------- 后台标签查询（不缓存，§12：管理员需要看到刚改完的数据） ----------

export type AdminTagListItem = TagSummary & {
  description: string | null;
  isActive: boolean;
  /** 已发布文章数（§7.2 展示列 / 默认排序键） */
  publishedCount: number;
  /** 总关联数（含草稿） */
  totalRelations: number;
  /** 最近使用时间 = 已发布文章的 max(published_at)；无已发布关联为 null（§10） */
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminTagListParams = {
  /** 搜索名称 / slug / 描述（包含匹配） */
  q?: string;
  status?: "all" | "active" | "inactive" | "unused";
  sort?: "posts" | "createdAt" | "updatedAt";
};

export async function listAdminTags(params: AdminTagListParams = {}): Promise<AdminTagListItem[]> {
  return queryWithRetry(async () => {
    const { q, status = "all", sort = "posts" } = params;
    const term = q?.trim() ?? "";
    const pattern = term ? `%${escapeLike(term)}%` : null;

    const conditions: SQL[] = [];
    if (pattern) {
      conditions.push(
        sql`(t.name ilike ${pattern} or t.slug ilike ${pattern} or t.description ilike ${pattern})`,
      );
    }
    if (status === "active") conditions.push(sql`t.is_active`);
    if (status === "inactive") conditions.push(sql`not t.is_active`);
    if (status === "unused") {
      conditions.push(sql`not exists (select 1 from ${postTags} pt where pt.tag_id = t.id)`);
    }
    const where = conditions.length > 0 ? sql`where ${and(...conditions)}` : sql``;
    const orderBy =
      sort === "createdAt"
        ? sql`t.created_at desc`
        : sort === "updatedAt"
          ? sql`t.updated_at desc`
          : sql`published_count desc, t.name`;

    const rows = await db.execute(sql`
      select t.id, t.name, t.slug, t.description, t.is_active, t.created_at, t.updated_at,
             count(p.id) filter (where p.published)::int as published_count,
             count(p.id)::int as total_relations,
             max(p.published_at) filter (where p.published) as last_used_at
      from ${tags} t
      left join ${postTags} pt on pt.tag_id = t.id
      left join ${posts} p on p.id = pt.post_id
      ${where}
      group by t.id
      order by ${orderBy}
    `);

    return (
      rows as unknown as ReadonlyArray<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        is_active: boolean;
        published_count: number;
        total_relations: number;
        last_used_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isActive: row.is_active,
      publishedCount: row.published_count,
      totalRelations: row.total_relations,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  });
}

/** 标签列表 KPI（§7.2）：总标签数与未使用标签数 */
export type AdminTagKpis = { total: number; unused: number };

export async function getAdminTagKpis(): Promise<AdminTagKpis> {
  return queryWithRetry(async () => {
    const rows = await db.execute(sql`
      select count(*)::int as total,
             count(*) filter (
               where not exists (select 1 from ${postTags} pt where pt.tag_id = ${tags.id})
             )::int as unused
      from ${tags}
    `);
    const row = firstRow(rows as ReadonlyArray<Record<string, number>>);
    return { total: row?.total ?? 0, unused: row?.unused ?? 0 };
  });
}

export type AdminTagDetail = TagSummary & {
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function getAdminTagById(id: string): Promise<AdminTagDetail | undefined> {
  return queryWithRetry(async () => {
    const [row] = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        description: tags.description,
        isActive: tags.isActive,
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
      })
      .from(tags)
      .where(eq(tags.id, id))
      .limit(1);
    return row;
  });
}

/** 标签使用统计（§10）：阅读量为当前关联已发布文章的 views 总和（快照） */
export type TagUsageStats = {
  publishedCount: number;
  draftCount: number;
  /** 总关联数（含草稿） */
  totalRelations: number;
  totalViews: number;
  lastUsedAt: Date | null;
};

export async function listTagUsageStats(tagId: string): Promise<TagUsageStats> {
  return queryWithRetry(async () => {
    const rows = await db.execute(sql`
      select
        count(p.id) filter (where p.published)::int as published_count,
        count(p.id) filter (where not p.published)::int as draft_count,
        count(p.id)::int as total_relations,
        coalesce(sum(p.views) filter (where p.published), 0)::int as total_views,
        max(p.published_at) filter (where p.published) as last_used_at
      from ${postTags} pt
      join ${posts} p on p.id = pt.post_id
      where pt.tag_id = ${tagId}::uuid
    `);
    const row = firstRow(
      rows as unknown as ReadonlyArray<{
        published_count: number;
        draft_count: number;
        total_relations: number;
        total_views: number;
        last_used_at: Date | null;
      }>,
    );
    return {
      publishedCount: row?.published_count ?? 0,
      draftCount: row?.draft_count ?? 0,
      totalRelations: row?.total_relations ?? 0,
      totalViews: row?.total_views ?? 0,
      lastUsedAt: row?.last_used_at ?? null,
    };
  });
}

/** 趋势点：跨缓存/渲染边界只传原始类型（§10） */
export type TagTrendPoint = { month: string; count: number };

/**
 * 近 N 个月新增已发布文章趋势，按 Asia/Shanghai 分月（§10，窗口起点须转回 timestamptz）。
 * UI 直接拿到连续 N 个自然月、缺失月份补 0 的完整序列。
 */
export async function listTagMonthlyTrend(tagId: string, months = 12): Promise<TagTrendPoint[]> {
  return queryWithRetry(async () => {
    const rows = await db.execute(sql`
      select to_char(date_trunc('month', p.published_at at time zone 'Asia/Shanghai'), 'YYYY-MM') as month,
             count(*)::int as count
      from ${postTags} pt
      join ${posts} p on p.id = pt.post_id
      where pt.tag_id = ${tagId}::uuid
        and p.published = true
        and p.published_at is not null
        and p.published_at >= (
          (date_trunc('month', now() at time zone 'Asia/Shanghai') - ((${months - 1}) || ' months')::interval)
          at time zone 'Asia/Shanghai'
        )
      group by 1
      order by 1
    `);
    const byMonth = new Map(
      (rows as unknown as ReadonlyArray<{ month: string; count: number }>).map((r) => [
        r.month,
        r.count,
      ]),
    );

    // 以 Asia/Shanghai 的当前月为终点补零
    const shanghaiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const points: TagTrendPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(shanghaiNow.getUTCFullYear(), shanghaiNow.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      points.push({ month: key, count: byMonth.get(key) ?? 0 });
    }
    return points;
  });
}

// ---------- 标签写入（不缓存，供后台 Server Action 调用） ----------

export type CreatedTag = { id: string; name: string; slug: string };

export type CreateTagResult =
  | { ok: true; tag: CreatedTag }
  | { ok: false; reason: "nameConflict"; existing: CreatedTag }
  | { ok: false; reason: "slugConflict"; slug: string };

/**
 * 新建标签（§7.3）：normalized_key 冲突报错并带回既有标签；自动 slug 冲突追加编号；
 * 手工 slug 冲突直接报错（手工值先经 normalizeManualTagSlug 归一化与校验）。
 */
export async function createTag(input: {
  name: string;
  manualSlug?: string;
  description: string | null;
  isActive: boolean;
}): Promise<CreateTagResult> {
  const displayName = normalizeTagName(input.name);
  const key = normalizeTagKey(input.name);
  if (!key) return { ok: false, reason: "slugConflict", slug: "" };

  const [nameHit] = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(eq(tags.normalizedKey, key))
    .limit(1);
  if (nameHit) return { ok: false, reason: "nameConflict", existing: nameHit };

  const values = {
    name: displayName,
    normalizedKey: key,
    isActive: input.isActive,
    description: input.description,
  };

  if (input.manualSlug) {
    const slug = normalizeManualTagSlug(input.manualSlug); // 抛错由 action 转 slug 字段错误
    const [slugHit] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);
    if (slugHit) return { ok: false, reason: "slugConflict", slug };
    const [row] = await db
      .insert(tags)
      .values({ ...values, slug })
      .returning({ id: tags.id, name: tags.name, slug: tags.slug });
    return { ok: true, tag: row };
  }

  // 自动 slug：冲突追加编号，与唯一索引冲突重试同一循环（§8.2 规则 7 / §20.4）
  const base = buildTagSlug(displayName);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const slug = withTagSlugSuffix(base, attempt);
    const inserted = await db
      .insert(tags)
      .values({ ...values, slug })
      .onConflictDoNothing()
      .returning({ id: tags.id, name: tags.name, slug: tags.slug });
    if (inserted.length > 0) return { ok: true, tag: inserted[0] };
    const [keyHit] = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .where(eq(tags.normalizedKey, key))
      .limit(1);
    if (keyHit) return { ok: true, tag: keyHit };
  }
  return { ok: false, reason: "slugConflict", slug: base };
}

/**
 * 编辑标签（§7.4）：name / description / is_active 可改，slug 不动；
 * 重命名先按新 normalized_key 查冲突（排除自身），冲突时拒绝保存。
 */
export async function updateTagRow(input: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; reason: "nameConflict"; existing: CreatedTag }> {
  const displayName = normalizeTagName(input.name);
  const key = normalizeTagKey(input.name);
  const [conflict] = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(and(eq(tags.normalizedKey, key), ne(tags.id, input.id)))
    .limit(1);
  if (conflict) return { ok: false, reason: "nameConflict", existing: conflict };

  await db
    .update(tags)
    // updatedAt 由应用层显式写入（无数据库触发器，§12）
    .set({
      name: displayName,
      normalizedKey: key,
      description: input.description,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, input.id));
  return { ok: true };
}

export async function setTagActive(id: string, isActive: boolean): Promise<void> {
  await db.update(tags).set({ isActive, updatedAt: new Date() }).where(eq(tags.id, id));
}

/** 硬删除（§7.5）：只允许无任何文章关联的标签；FK RESTRICT 之上先做应用层检查给出可读错误 */
export async function deleteTagById(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "hasRelations" }> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(postTags)
    .where(eq(postTags.tagId, id));
  if (value > 0) return { ok: false, reason: "hasRelations" };
  await db.delete(tags).where(eq(tags.id, id));
  return { ok: true };
}

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
    // (?n) 行敏感前缀：PG 的 ARE 里 `.` 默认匹配换行（与 JS 不同），无它时 `.*?` 会
    // 从更早的 `![` 一路跨行吞到后面某个 `](`，导致真实正文插图被跳过、引用误判为 0
    const IMG_REGEX =
      "(?n)(?:!\\[.*?\\]\\((https?://[^\\s\\)\"'<>]+|/[^\\s\\)\"'<>]+\\.[a-zA-Z0-9]+)\\)|<img\\s[^>]*src=[\"']([^\"']+)[\"'])";

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
