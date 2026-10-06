-- ============================================================
-- jiangruijian's blog RLS / 索引 / 函数
-- 依赖：先跑 `pnpm db:migrate`（建好 posts / settings 表），再执行本脚本。
-- 认证：Auth.js(NextAuth)。
-- 说明：Drizzle 直连使用 postgres（表 owner，RLS 被绕过），因此后台读写都走服务端
--       —— 写操作权限由 NextAuth + Server Action 在应用层保证。
--       此处 RLS 主要约束「公开只读已发布文章」，并拒绝一切非服务端写入。
-- ============================================================

-- ------------------------------------------------------------
-- 查询超时（可选，默认关闭）
-- 背景：连接池 Supavisor(6543) 会忽略客户端启动参数里的 statement_timeout，
-- 所以应用里 postgres(..., { connection: { statement_timeout } }) 实测无效，
-- 实际生效的是服务端默认值（2min）—— 万一查询卡住，前端要转圈两分钟才失败。
-- 打开下面这行可把上限压到 15s（角色级设置才穿得过连接池，对之后建立的连接生效）。
-- 副作用：同角色下的迁移 / 长查询也会在 15s 被取消（迁移前可临时
-- `set statement_timeout = 0;` 绕过）。恢复默认：alter role postgres reset statement_timeout;
-- 2026-09-13 决定暂不开启；需要时取消注释执行即可。
-- ------------------------------------------------------------
-- alter role postgres set statement_timeout = '15s';

-- 模糊搜索（中文效果一般，先用着；后续可换 pg_bigm）
create extension if not exists pg_trgm;

create index if not exists posts_title_trgm on posts using gin (title gin_trgm_ops);
create index if not exists posts_content_trgm on posts using gin (content_md gin_trgm_ops);

-- （P5 已删）标签数组重叠检索 posts_tags_gin 随 posts.tags 列一并移除；
-- 标签检索现在走 post_tags_tag_id_idx（见本文件末尾）。

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

-- 权限收紧：Postgres 默认把函数 EXECUTE 授予 PUBLIC（anon / authenticated 会继承），
-- 意味着只要拿到 anon key，就能直接调这个 RPC 刷阅读量。这里收回公开执行权，
-- 只留给服务端可信角色：表 owner postgres（应用运行时连接）+ service_role（备用）。
-- 自查：select has_function_privilege('anon', 'public.increment_post_views(uuid)', 'execute'); -- 应为 false
revoke execute on function public.increment_post_views(uuid) from public, anon, authenticated;
grant execute on function public.increment_post_views(uuid) to service_role;

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

-- ------------------------------------------------------------
-- 标签（tags / post_tags）—— spec-tag-management §12 / §14
-- 表结构由 Drizzle 迁移创建（drizzle/0001_*.sql，含 normalized_key / slug 的
-- UNIQUE 约束）；二级索引与 RLS 按分工落在本脚本。
-- 权限模型与 posts 相同：owner（Drizzle 直连）绕过 RLS，写操作只走服务端
-- Server Action + isAdmin()；这里只约束非 owner 的公开读，不创建任何写策略。
-- ------------------------------------------------------------
alter table tags enable row level security;
alter table post_tags enable row level security;

-- tags：启用中的标签是公开数据（前台标签云 / 标签页 / sitemap），开放只读；
-- 停用标签（is_active = false）对匿名不可见。
drop policy if exists "tags_public_read" on tags;
create policy "tags_public_read" on tags
  for select using (is_active = true);

-- post_tags：不创建任何策略 → 非 owner 一律拒绝。
-- 关联表里包含草稿文章的标签，不开放匿名直读，避免暴露未发布内容（§12）。

-- 标签页 / 计数用：按 tag_id 反查文章（主键只覆盖按 post_id 正查）
create index if not exists post_tags_tag_id_idx on post_tags (tag_id, post_id);

-- 趋势统计（按 published_at 分月）与发布态过滤
create index if not exists posts_published_at_idx on posts (published, published_at);