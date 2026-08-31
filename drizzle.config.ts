import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";

// 本地跑 drizzle-kit 时自动加载 .env.local；部署时密钥由平台注入
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
