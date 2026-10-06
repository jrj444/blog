/**
 * 执行仓库里的 SQL 脚本（supabase/rls.sql 等）。
 *
 * 背景：本机没有 psql，Supabase 控制台 SQL Editor 手工粘贴容易漏段；
 * 这里走与 db:backup 相同的 DATABASE_URL 直连通道整文件执行。
 * 用法：pnpm db:sql supabase/rls.sql（或 node scripts/execute-sql.ts <文件>）
 *
 * 切分规则：按行扫描，`--` 整行注释跳过，$$…$$ 函数体原样保留（其中的分号
 * 不算语句边界），语句以行尾分号结束。rls.sql 的编写约定与此匹配
 * （语句都以行尾分号结束、注释独占一行）。
 *
 * 只做执行，不做校验；rls.sql 自身全部使用 if not exists / or replace /
 * drop policy if exists，可安全重复执行。
 */
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("缺少 DATABASE_URL（.env.local 或环境变量）");
  process.exit(1);
}

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("用法：node scripts/execute-sql.ts <sql 文件路径>");
  process.exit(1);
}

/** 按行切分语句：跳过整行注释，$$ 函数体不拆分，语句以行尾分号结束 */
function splitStatements(content: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let inDollar = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!inDollar) {
      if (trimmed === "" || trimmed.startsWith("--")) continue;
    }
    current.push(line);

    // 统计本行 $$ 出现次数：奇数次切换进出函数体状态
    const dollarCount = (line.match(/\$\$/g) ?? []).length;
    if (dollarCount % 2 === 1) inDollar = !inDollar;

    if (!inDollar && trimmed.endsWith(";")) {
      statements.push(current.join("\n"));
      current = [];
    }
  }
  if (current.some((l) => l.trim() !== "")) {
    throw new Error("文件末尾存在未以分号结束的语句（或 $$ 未闭合），请检查文件");
  }
  return statements;
}

const statements = splitStatements(readFileSync(file, "utf8"));
console.log(`执行 ${file}：共 ${statements.length} 条语句`);

const sql = postgres(DATABASE_URL, {
  max: 1,
  ssl: "require",
  connect_timeout: 15,
  onnotice: (notice) => {
    const message = notice.message ?? "";
    // does not exist / already exists 类 notice 是幂等脚本的正常噪音
    if (message) console.log(`  [notice] ${message}`);
  },
});

async function main(): Promise<void> {
  let done = 0;
  for (const statement of statements) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 72);
    await sql.unsafe(statement);
    done += 1;
    console.log(`  [${done}/${statements.length}] ${preview}${preview.length >= 72 ? "…" : ""}`);
  }
  console.log(`✓ ${file} 执行完毕（${done} 条语句）`);
}

main()
  .then(async () => {
    await sql.end({ timeout: 5 });
  })
  .catch(async (error: unknown) => {
    console.error("执行失败：", error);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exitCode = 1;
  });
