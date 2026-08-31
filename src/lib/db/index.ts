import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 运行时走连接池(6543)，避免 serverless 函数耗尽连接；未配 pooler 时回退直连
const poolerUrl = process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL;

const globalForDb = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.sqlClient ??
  postgres(poolerUrl!, {
    // Supabase pooler 事务模式下不能复用 prepared statements
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 10 : 1,
    // Supabase 云实例要求 TLS
    ssl: "require",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sqlClient = client;
}

export const db = drizzle(client, { schema });
