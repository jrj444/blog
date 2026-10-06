/**
 * 标签数据回填（spec-tag-management §13.2）。
 *
 * 【已退役 · 2026-10-06】P5 删除 posts.tags 列后本脚本不可再运行（读不到源数据），
 * 保留作一次性迁移的历史记录。回滚场景请用 backups/ 下的备份脚本产物（§17）。
 *
 * 用法：node scripts/backfill-tags.ts
 *
 * - 从 posts.tags text[] 读取全部旧标签，归一化合并变体后写入 tags / post_tags。
 * - 必须复用 src/lib/tags 的归一化实现（相对路径 + .ts 扩展名，Node 类型剥离
 *   不解析 @/* 别名）；禁止在 SQL 或本脚本里另写一套（§13 方案落点）。
 * - 幂等：已存在的 tags 按 normalized_key 复用，post_tags 用 on conflict do
 *   nothing 跳过，published_at 只补空值——可安全重复执行。
 *   注意：幂等的前提是「迁移窗口内重跑」；标签管理（P2）上线后重跑，已改名标签
 *   的旧 key 会作为新标签复活，届时不要再跑本脚本。
 * - 走 DATABASE_URL 直连（5432）而非 6543 连接池：批量写入不挤占运行时池（§13）。
 */
import { existsSync } from "node:fs";
import postgres from "postgres";
import { normalizeTagName, normalizeTagKey } from "../src/lib/tags/normalize.ts";
import { buildTagSlug, withTagSlugSuffix } from "../src/lib/tags/slug.ts";

// 照 drizzle.config.ts 的写法：本地跑脚本时自动加载 .env.local
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("缺少 DATABASE_URL（.env.local 或环境变量）");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  ssl: "require",
  connect_timeout: 15,
  onnotice: () => {},
});

/** 规范名称选择（§13.2）：出现次数多 → 较短 → 字典序 */
function canonicalName(counts: Map<string, number>): string {
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1),
  )[0][0];
}

interface TagPlan {
  key: string;
  name: string;
  base: string;
  slug: string;
}

async function main(): Promise<void> {
  await sql.begin(async (tx) => {
    const posts = await tx<[{ id: string; tags: string[] }]>`
      select id, tags from posts order by created_at, id
    `;

    // ---- 1) 聚合变体：key → 各写法的出现次数（§13.2 步骤 1-3、7）----
    // 同一文章内重复 key 只保留第一次出现；出现顺序即 position。
    const variants = new Map<string, Map<string, number>>();
    const relations = new Map<string, { postId: string; position: number }[]>();
    for (const post of posts) {
      const seen = new Set<string>();
      for (const raw of post.tags ?? []) {
        const key = normalizeTagKey(raw);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const name = normalizeTagName(raw);
        const counts = variants.get(key) ?? new Map<string, number>();
        counts.set(name, (counts.get(name) ?? 0) + 1);
        variants.set(key, counts);
        const rows = relations.get(key) ?? [];
        rows.push({ postId: post.id, position: rows.length });
        relations.set(key, rows);
      }
    }

    // ---- 2) 规范名称与 slug 计划（§13.2 步骤 4-5）----
    // 按 key 排序：重跑时 slug 分配顺序稳定（幂等的另一半）。
    const planned: TagPlan[] = [...variants.entries()]
      .map(([key, counts]) => {
        const name = canonicalName(counts);
        return { key, name, base: buildTagSlug(name), slug: "" };
      })
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const existing = await tx<[{ id: string; normalized_key: string; slug: string }]>`
      select id, normalized_key, slug from tags
    `;
    const keyToId = new Map(existing.map((t) => [t.normalized_key, t.id]));

    // ---- 3) 写入 tags：on conflict do nothing + 按 key 回查（幂等 + 并发安全，§8.2 规则 7）----
    // 不带 target 的 on conflict 覆盖 normalized_key 与 slug 两个唯一约束：
    // 回查命中 = 标签已存在（复用）；未命中 = slug 被占，换后缀重试。
    for (const plan of planned) {
      if (keyToId.has(plan.key)) continue;
      let attempt = 1;
      for (;;) {
        plan.slug = withTagSlugSuffix(plan.base, attempt);
        const inserted = await tx<[{ id: string }]>`
          insert into tags (name, normalized_key, slug)
          values (${plan.name}, ${plan.key}, ${plan.slug})
          on conflict do nothing
          returning id
        `;
        if (inserted.length > 0) {
          keyToId.set(plan.key, inserted[0].id);
          console.log(`tag: ${plan.name} → /tags/${plan.slug}`);
          break;
        }
        const [hit] = await tx<[{ id: string }]>`
          select id from tags where normalized_key = ${plan.key}
        `;
        if (hit) {
          keyToId.set(plan.key, hit.id);
          break;
        }
        attempt += 1;
        if (attempt > 5) {
          throw new Error(`标签「${plan.name}」的 slug 分配失败（冲突超过 5 次）`);
        }
      }
    }

    // ---- 4) 写入 post_tags（按数组顺序写 position，§13.2 步骤 6）----
    const rows: [string, string, number][] = [];
    for (const [key, usage] of relations) {
      const tagId = keyToId.get(key);
      if (!tagId) throw new Error(`标签 key「${key}」没有对应的 tags 行`); // 不应发生
      for (const { postId, position } of usage) {
        rows.push([postId, tagId, position]);
      }
    }
    if (rows.length > 0) {
      await tx`
        insert into post_tags (post_id, tag_id, position)
        values ${tx(rows)}
        on conflict do nothing
      `;
    }

    // ---- 5) 已发布文章的 published_at 以 created_at 回填（§13.2 步骤 8-9）----
    // 必须带 where published_at is null：重复执行不得覆盖应用层后来写入的值。
    await tx`
      update posts set published_at = created_at
      where published = true and published_at is null
    `;
  });

  // ---- 6) 自查与对账（§13.2 步骤 10、§13.5）----
  const [{ count: missing }] = await sql<[{ count: number }]>`
    select count(*)::int as count from posts where published = true and published_at is null
  `;
  const [{ count: postCount }] = await sql<[{ count: number }]>`
    select count(*)::int as count from posts
  `;
  const [{ count: tagCount }] = await sql<[{ count: number }]>`
    select count(distinct normalized_key)::int as count from tags
  `;
  const [{ count: relationCount }] = await sql<[{ count: number }]>`
    select count(*)::int as count from post_tags
  `;

  console.log(`对账：posts=${postCount}（应不变），tags=${tagCount}，post_tags=${relationCount}`);
  if (missing !== 0) {
    console.error(`⚠️ 自查失败：${missing} 篇已发布文章的 published_at 为空（§13.2）`);
    process.exitCode = 1;
  } else {
    console.log("✓ 自查通过：已发布文章的 published_at 无遗漏（0 条）");
  }
}

main()
  .then(async () => {
    await sql.end({ timeout: 5 });
  })
  .catch(async (error: unknown) => {
    console.error("回填失败：", error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exitCode = 1;
  });
