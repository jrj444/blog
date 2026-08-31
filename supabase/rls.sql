-- ============================================================
-- jiangruijian's blog RLS / 索引 / 函数
-- 依赖：先跑 `pnpm db:migrate`（建好 posts / settings 表），再执行本脚本。
-- 认证：Auth.js(NextAuth)。
-- 说明：Drizzle 直连使用 postgres（表 owner，RLS 被绕过），因此后台读写都走服务端
--       —— 写操作权限由 NextAuth + Server Action 在应用层保证。
--       此处 RLS 主要约束「公开只读已发布文章」，并拒绝一切非服务端写入。
-- ============================================================

-- 模糊搜索（中文效果一般，先用着；后续可换 pg_bigm）
create extension if not exists pg_trgm;

create index if not exists posts_title_trgm on posts using gin (title gin_trgm_ops);
create index if not exists posts_content_trgm on posts using gin (content_md gin_trgm_ops);

-- 标签数组重叠检索
create index if not exists posts_tags_gin on posts using gin (tags);

-- 阅读量：security definer 原子自增，仅对已发布文章生效，避免开放 posts.update
create or replace function public.increment_post_views(post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update posts
     set views = views + 1
   where id = post_id
     and published = true;
end;
$$;

-- ------------------------------------------------------------
-- RLS
-- 说明：表 owner（postgres，Drizzle 直连用户）会绕过 RLS，所以读写都走服务端。
--       这里只给「已发布文章」开放公开读；写策略不创建（非 owner 一律拒绝）。
-- ------------------------------------------------------------
alter table posts enable row level security;
alter table settings enable row level security;

-- posts：仅已发布文章公开可读；草稿、写操作仅服务端（owner 绕过 RLS）
drop policy if exists "posts_public_read" on posts;
create policy "posts_public_read" on posts
  for select using (published = true);