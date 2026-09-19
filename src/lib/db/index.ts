import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 运行时走连接池(6543)，避免 serverless 函数耗尽连接；未配 pooler 时回退直连
const poolerUrl = process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL;

const isProduction = process.env.NODE_ENV === "production";

/**
 * Supabase 连接池(6543, transaction 模式) + serverless 的注意事项：
 * - `prepare: false`：事务模式下不能复用 prepared statements。
 * - `idle_timeout` / `max_lifetime`：不设的话空闲连接永不释放。
 * - `keep_alive`：TCP keepalive 首个探测包之前的空闲秒数（默认 60s）。
 *   本地走代理（Clash/TUN 等）时空闲连接常被对端静默丢弃，本地却还认为它活着，
 *   下一条查询会写进「黑洞」，非要等 TCP 重传耗尽（分钟级）才报错 —— 表现就是
 *   页面转圈几分钟然后自己好了。调小到 10s 让操作系统更快发现死连接。
 * - `connect_timeout`：建立连接的上限（默认 30s），网络异常时快速失败。
 * - `statement_timeout`：**只对直连生效** —— 实测 Supavisor(6543) 会忽略客户端
 *   启动参数，连接池上真正生效的是服务端默认值（2min）。想收紧到 15s 需在数据库侧
 *   执行角色级设置，`supabase/rls.sql` 里有现成语句（默认注释掉，按需开启）。
 */
function createClient() {
  return postgres(poolerUrl!, {
    prepare: false,
    // 本地开发放开到 5：支持仪表盘并发查询与重试，避免连接竞争
    max: isProduction ? 10 : 5,
    // Supabase 云实例要求 TLS
    ssl: "require",
    // 秒：建立连接的上限（默认 30s，卡住时会表现成「转圈约 30 秒」）
    connect_timeout: 15,
    // 秒：本地开发时让空闲连接尽快归还给池子
    idle_timeout: isProduction ? 30 : 10,
    // 秒：连接最长存活时间，避免长期占用
    max_lifetime: isProduction ? 60 * 30 : 60 * 5,
    // 秒：TCP keepalive 探测间隔（默认 60），见上面的说明
    keep_alive: isProduction ? 60 : 10,
    // 毫秒：单条语句上限。Supavisor 会忽略这些启动参数（只有直连才生效）；
    // 连接池实际是服务端默认的 2min，收紧方法见 supabase/rls.sql。
    connection: {
      statement_timeout: 15000,
    },
  });
}

function createDb(client: ReturnType<typeof createClient>) {
  return drizzle(client, { schema });
}

/**
 * 用 globalThis 缓存实例：`next dev` 的 HMR 会反复重新求值本模块，
 * 每次都 new 一个 postgres 客户端会留下没人回收的连接池（旧池不会自动关闭），
 * 这既是连接被占满的原因，也是当初不得不把 max 压到 1 的原因。
 */
const globalForDb = globalThis as unknown as {
  __blogPostgres?: ReturnType<typeof createClient>;
  __blogDb?: ReturnType<typeof createDb>;
};

const client = globalForDb.__blogPostgres ?? createClient();
export const db = globalForDb.__blogDb ?? createDb(client);

if (!isProduction) {
  globalForDb.__blogPostgres = client;
  globalForDb.__blogDb = db;
}

/**
 * 连接级（而非 SQL 级）错误码：连接被关掉 / 被池化层回收。
 * 这类失败里查询往往还没真正执行，**只读**查询重试一次通常就能成功。
 */
const RETRIABLE_DB_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  // 卡住的语句被服务端取消（statement_timeout / 用户取消）。
  // 本地经代理链路时它就代表「连接卡死」，换条连接重试一次往往就好了；
  // 代价是：如果查询本身真的慢，会再等一个超时周期（只对只读查询使用）。
  "57014",
]);

export function isRetriableDbError(error: unknown): boolean {
  let curr: unknown = error;
  while (typeof curr === "object" && curr !== null) {
    const e = curr as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === "string" && RETRIABLE_DB_CODES.has(e.code)) {
      return true;
    }
    if (typeof e.message === "string") {
      const msg = e.message.toLowerCase();
      if (
        msg.includes("connection closed") ||
        msg.includes("connection destroyed") ||
        msg.includes("econnreset") ||
        msg.includes("etimedout") ||
        msg.includes("econnrefused") ||
        msg.includes("connect timeout")
      ) {
        return true;
      }
    }
    curr = e.cause;
  }
  return false;
}

/**
 * 只读查询的轻量重试。
 *
 * 背景：postgres.js 不会重试「已经发出、但连接中途挂掉」的查询（一律 reject），
 * 于是偶发的连接失效会直接变成 500。这里补一次重试，把「偶发 500」变成
 * 「慢一点的 200」。
 *
 * 注意：写操作（insert/update/delete/RPC 自增）不要套这个，避免重复写入。
 */
export async function queryWithRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetriableDbError(error)) throw error;
      // 退避一下：给池子时间丢掉坏连接、建新连接
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }

  throw lastError;
}
