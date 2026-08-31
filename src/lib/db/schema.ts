import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// 文章正文、标签、封面等全部入库（Markdown），为后续 AI/RAG 铺路。
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentMd: text("content_md").notNull(),
    coverImage: text("cover_image"),
    tags: text("tags").array().notNull().default([]),
    published: boolean("published").notNull().default(false),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("posts_slug_idx").on(table.slug),
    index("posts_published_idx").on(table.published),
  ],
);

// 站点级配置：目前存 admin_email(唯一管理员)。后续可存 title/description 等。
// RLS 脚本 `supabase/rls.sql` 会单独建索引 / 触发器 / RPC。
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
