import {
  pgTable,
  text,
  boolean,
  integer,
  smallint,
  timestamp,
  uuid,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// 文章正文、封面、发布时间等全部入库（Markdown），为后续 AI/RAG 铺路。
// 标签自 2026-10 起在 tags / post_tags 关系表（见下），旧标签数组列已删除。
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentMd: text("content_md").notNull(),
    coverImage: text("cover_image"),
    published: boolean("published").notNull().default(false),
    // 发布时间：后台表单可编辑，新建默认 now()；发布时留空由服务端填 now()。
    // 纯应用层保证——不加数据库 CHECK / 触发器（spec §5.3），兜底见回填脚本的自查 SQL。
    publishedAt: timestamp("published_at", { withTimezone: true }),
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

// 标签实体：稳定 ID + 归一化唯一键防重复 + slug 创建后不可变（spec §5.1）。
// name/slug/description 的长度上限（50/60/200）由 validator 与服务端双重校验，不设 varchar。
// RLS 与二级索引在 supabase/rls.sql（分工见 spec §13）。
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 归一化唯一键：React / REACT / Ｒｅａｃｔ 归为同一行；与 slug 缺一不可（§6.1）
  normalizedKey: text("normalized_key").notNull().unique(),
  // URL 标识，创建后不可修改——重命名只改 name / normalized_key
  slug: text("slug").notNull().unique(),
  description: text("description"),
  // 停用 = 前台隐藏、禁止新增关联；已有文章的关联保留（§7.5 / §8.2 规则 2）
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 文章与标签的多对多关联（spec §5.2）。
// created_at 语义是「首次关联时间」：保存文章按 diff 只增删行、只改 position，禁止全删重建（§8.2 规则 4）。
export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type PostTag = typeof postTags.$inferSelect;
export type NewPostTag = typeof postTags.$inferInsert;
