import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 运行时走连接池(6543)，避免 serverless 函数耗尽连接；未配 pooler 时回退直连
const poolerUrl = process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL;

const isProduction = process.env.NODE_ENV === "production";

/**
 * Supabase 连接池(6543, transaction 模式) + serverless 的注意事项：
 * - `prepare: false`：事务模式下不能复用 prepared statements。
 * - `idle_timeout` / `max_lifetime`：不设的话空闲连接永不释放。本地 `next dev`
 *   会因为 HMR 反复重新求值模块而堆积连接，把池子占满后新查询会一直排队
 *   —— 表现为页面无限转圈（既不报错也不超时）。这里显式回收。
 * - `connect_timeout` / `statement_timeout`：网络异常时快速失败并抛出，
 *   而不是让请求永久挂起。
 */
const client = postgres(poolerUrl!, {
  prepare: false,
  max: isProduction ? 10 : 1,
  // Supabase 云实例要求 TLS
  ssl: "require",
  // 秒：建立连接的上限（默认 30s，卡住时会表现成「转圈约 30 秒」）
  connect_timeout: 15,
  // 秒：本地开发时让空闲连接尽快归还给池子
  idle_timeout: isProduction ? 30 : 10,
  // 秒：连接最长存活时间，避免长期占用
  max_lifetime: isProduction ? 60 * 30 : 60 * 5,
  // 毫秒：单条语句上限，超时抛错（避免请求永久挂起）
  connection: {
    statement_timeout: 15000,
  },
});

export const db = drizzle(client, { schema });
