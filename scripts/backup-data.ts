/**
 * 数据备份脚本（免费版 Supabase 没有 控制台备份 / PITR，pg_dump 本机也不可用——
 * supabase CLI 的 db dump 依赖 Docker）。
 *
 * 原理：
 * 1. 由 information_schema 读出每张表的列，拼一条「服务端生成 INSERT」的查询——
 *    用 quote_nullable 产出值字面量，转义（字符串/数组/jsonb/NULL/timestamptz）
 *    由 Postgres 自己保证，JS 侧不做任何手写转义；
 * 2. 同一会话内建 TEMP 表（like ... including all，临时表遮蔽同名实体表），
 *    把生成的 INSERT 回灌进去，比对行数与整表 md5 摘要——校验失败立即报错；
 *    只碰 TEMP 表，对数据库零持久写入；
 * 3. 写出 backups/blog-data-<时间戳>.sql（begin/commit 包裹的纯 INSERT）。
 *
 * 边界（有意为之）：只备数据，不备结构/索引/RLS/函数——这些由仓库里的
 * drizzle 迁移 + supabase/rls.sql 完整重建。恢复：先重建结构，再对空表执行本文件。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";

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

/**
 * 备份的表与排序：FK 拓扑序（post_tags 依赖 posts 与 tags，必须排在其后），
 * 恢复时才能直接执行；排序键为硬编码常量（trusted），支持多列。
 */
const TABLES: { table: string; orderBy: string }[] = [
  { table: "settings", orderBy: "key" },
  { table: "tags", orderBy: "name" },
  { table: "posts", orderBy: "id" },
  { table: "post_tags", orderBy: "post_id, tag_id" },
];

interface Column {
  column_name: string;
}

/** SQL 标识符转义（信息来自硬编码表名与 information_schema，非用户输入；postgres.js 无 identifier/raw 辅助） */
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function main(): Promise<void> {
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const file = `backups/blog-data-${stamp}.sql`;

  const body: string[] = [];
  const summary: string[] = [];
  let verified = true;

  await sql.begin(async (tx) => {
    for (const { table, orderBy } of TABLES) {
      const columns = await tx<Column[]>`
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = ${table}
        order by ordinal_position
      `;
      if (columns.length === 0) throw new Error(`表 ${table} 不存在或没有列`);

      const colNames = columns.map((c) => c.column_name);
      const colList = colNames.map(ident).join(", ");
      // 服务端逐行生成 INSERT：quote_nullable 处理一切值的转义
      const expr = colNames.map((n) => `quote_nullable(${ident(n)})`).join(` || ', ' || `);
      const generated = await tx.unsafe<[{ stmt: string }]>(
        `select 'insert into ${ident(table)} (${colList}) values (' || ${expr} || ');' as stmt
         from ${ident(table)} order by ${orderBy}`,
      );
      const statements = generated.map((row) => row.stmt);
      if (statements.length === 0) {
        summary.push(`${table}: 0 行（空表）`);
        continue;
      }

      // 回灌校验：TEMP 表遮蔽同名实体表，INSERT 全部落进 TEMP；零持久写入
      await tx.unsafe(
        `create temp table ${ident(table)} (like public.${ident(table)} including all)`,
      );
      for (const stmt of statements) {
        await tx.unsafe(stmt);
      }
      const digestQuery = (qualified: string) =>
        `select count(*)::int as n,
                md5(coalesce(string_agg(row_to_json(t)::text, '' order by ${orderBy}), '')) as digest
         from ${qualified}${ident(table)} t`;
      const [origin] = await tx.unsafe<[{ n: number; digest: string }]>(digestQuery("public."));
      // 不加 schema 限定：解析到 TEMP 表（遮蔽实体表），才是真正的回灌结果
      const [copy] = await tx.unsafe<[{ n: number; digest: string }]>(digestQuery(""));
      const ok = origin.n === copy.n && origin.digest === copy.digest;
      verified = verified && ok;
      summary.push(
        `${table}: ${origin.n} 行，回灌 ${copy.n} 行，摘要 ${ok ? "一致 ✓" : `不一致 ✗（${origin.digest} vs ${copy.digest}）`}`,
      );
      if (!ok) {
        throw new Error(`表 ${table} 回灌校验失败——备份文件不可信，已中止写出`);
      }
      body.push(`-- ${table}（${origin.n} 行）`, ...statements, "");
    }
    // sql.begin 收尾的 COMMIT 只会提交 TEMP 表内容，对实体表零持久写入
  });

  if (!verified) throw new Error("校验未通过");

  const content = [
    `-- blog 数据备份 @ ${new Date().toISOString()}`,
    `-- 生成：node scripts/backup-data.ts（服务端 quote_nullable 转义 + TEMP 表回灌校验通过）`,
    `-- 恢复：先用 drizzle 迁移 + supabase/rls.sql 重建表结构，再对空表执行本文件：`,
    `--   psql "$DATABASE_URL" -f <本文件>`,
    "begin;",
    ...body,
    "commit;",
    "",
  ].join("\n");
  writeFileSync(file, content, "utf8");

  console.log(`✓ 备份已写出：${file}（${(content.length / 1024).toFixed(1)} KB）`);
  for (const line of summary) console.log(`  ${line}`);
}

main()
  .then(async () => {
    await sql.end({ timeout: 5 });
  })
  .catch(async (error: unknown) => {
    console.error("备份失败：", error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exitCode = 1;
  });
