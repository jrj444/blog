# jiangruijian's blog —— 博客系统 Spec v3（定稿讨论版 + 进度核对）

> 定位：个人技术博客。本项目由作者亲自搭建，本 spec 作为实现蓝图与讨论依据。（注：AI 相关规划已移出本主 spec，后续视需要再另立独立 SPEC 讨论）。

> **进度核对时间：2026-10-16**（前一次核对：2026-10-06；2026-09-13）。本章节基于对 `src/`、`drizzle/`、`supabase/rls.sql`、`.env.example`、`package.json` 的实际代码核对，更新了路线图与「实现偏差说明」，并修正了正文中与实现不一致的旧描述（如封面图已接入、认证已改用 Auth.js、数据库表为 `posts + settings + tags + post_tags + post_likes + comments` 等）。

> **2026-09-13 增补**：① 站点已上线（线上入口 `https://www.jiangruijian.com`，apex `jiangruijian.com` 308 → www）；② 后台仪表盘已从骨架变为实做；③ 更正「关于页已完成」的旧记录（实际未实现），并于当日补齐；④ 修复两处线上体验问题——数据库连接池抗抖动（`keep_alive` / 连接池单例 / 只读查询重试）与登录后回跳原页面（含开放重定向修复）。
>
> **2026-10-06 增补**：标签管理体系 v1 全量落地（独立实体、关系表、归一化去重、后台管理与 12 个月趋势统计，详见 `specs/spec-tag-management.md`）。
>
> **2026-10-16 增补**：自建评论与文章点赞体系 v1 全量落地（详见 `specs/spec-comments-likes.md`）：① 放弃 Giscus 外部依赖，采用自建 `comments` + `post_likes` 两张表；② 评论采用知乎式两级扁平楼中楼（根评论 + 楼内回复流，显示 `XXX ▶ YYY` 对话指向）；③ 匿名先审后显机制 + 蜜罐防机器人 + HMAC-SHA256 IP 限流；④ 预留 `NEXT_PUBLIC_ENABLE_COMMENTS` ICP 备案一键隐藏开关；⑤ 前台卡片与后台仪表盘/文章列表全面集成点赞数与评论管理。

## 1. 项目概述

| 项     | 值                                                     |
| ------ | ------------------------------------------------------ |
| 项目名 | jiangruijian's blog                                    |
| 定位   | 个人技术博客                                           |
| 部署   | Vercel（Hobby 免费版）                                 |
| 数据库 | Supabase（PostgreSQL）                                 |
| 认证   | **Auth.js（NextAuth v5, GitHub OAuth）** + 管理员白名单（已实现；不等同于原 spec 的 Supabase Auth） |
| 包管理 | pnpm / Node 22+                                        |
| 写作   | 文章正文入 Supabase 数据库（Markdown），后台编辑器发布 |

## 2. 技术栈

| 类别   | 技术                                             | 说明                                               |
| ------ | ------------------------------------------------ | -------------------------------------------------- |
| 框架   | Next.js 16（App Router）+ TypeScript             | 全栈，前端 + Serverless 后端一体                   |
| UI     | Tailwind CSS 4 + shadcn/ui                       | 快速搭界面                                         |
| ORM    | Drizzle ORM + postgres.js                        | SQL-first，配 Supabase                             |
| 数据库 | Supabase Postgres + pg_trgm                      | 存储 + 模糊检索                                    |
| 认证   | **Auth.js(NextAuth v5) + GitHub OAuth + ADMIN_EMAILS 白名单** | 会话走 cookie；已实现。原 spec 的 Supabase Auth 未采用 |
| 编辑   | @mdxeditor/editor                                | 后台 Markdown 编辑器（已接入 toolbar + placeholder）|
| 渲染   | react-markdown + remark-gfm + rehype-pretty-code | 正文渲染 + 代码高亮（shiki）                        |
| 存储   | **Cloudflare R2（已接）**                      | 封面图可手填 URL，也可在后台选图上传：浏览器端压缩转 WebP（长边 1600）→ 服务端签发预签名 PUT → 直传 R2 → 公开 URL 存库     |
| 互动   | **自建评论与点赞体系（已上线）**                 | 自建 `comments` + `post_likes` 表；知乎式两级楼中楼 + 先审后显 + 蜜罐/IP 限流 + 备案开关 |

> 注：`@supabase/supabase-js` 已从依赖中移除（2026-10 清理），运行时直连 Drizzle + postgres。

## 3. 架构决策（已定）

| 决策               | 结论                                             | 理由                                                                |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| 全栈还是前后端分离 | **Next.js 全栈，不分离**                         | 博客重 SEO + SSR，分离是负优化（详见讨论）                          |
| 上 Cloudflare？    | **保留 Vercel**                                  | Vercel + Supabase 最省心；Cloudflare 需 OpenNext 适配，不必为换而换 |
| 数据库/认证        | **数据库用 Supabase；认证改用 Auth.js**          | 认证/Storage/Realtime 开箱即用；但最终用 NextAuth 实现单管理员      |
| 文章存哪           | **正文入数据库（Markdown），不用 content/ 目录** | 为后续内容管理与快速检索铺路                                       |
| 内容格式           | **Markdown（不是 MDX）**                         | 渲染更简单安全；如需文章内嵌 React 组件再升级 MDX                   |
| 后台编辑器         | @mdxeditor（Markdown 编辑器）                    | 写作体验好；它本质是 Markdown 编辑器                                |

## 4. 目录结构（已实现）

```
jiangruijians-blog/
├── src/
│   ├── app/
│   │   ├── (blog)/                       # 前台（导航/页脚 layout）
│   │   │   ├── layout.tsx                # 前台布局
│   │   │   ├── page.tsx                  # 首页（最新文章 + 点赞数）
│   │   │   ├── posts/page.tsx            # 文章列表 + 搜索 + 分页 + 点赞数
│   │   │   ├── posts/[slug]/page.tsx     # 文章详情（Markdown 渲染 + 点赞 + 知乎式楼中楼评论）
│   │   │   ├── posts/[slug]/actions.ts   # 阅读量视图 RPC / 点赞 / 评论提交 Server Actions
│   │   │   ├── tags/[tag]/page.tsx       # 标签聚合 + 分页 + 点赞数
│   │   │   ├── about/page.tsx            # 关于页
│   │   │   ├── error.tsx / not-found.tsx
│   │   ├── admin/                        # 后台（字面量路径 /admin）
│   │   │   ├── layout.tsx                # 后台布局 + 登录校验 + 导航入口
│   │   │   ├── page.tsx                  # 仪表盘（KPI 含总点赞 / 最近更新 / Top 5 / 标签分布）
│   │   │   ├── posts/page.tsx            # 文章管理表格（阅读/点赞复合展示）+ 删除
│   │   │   ├── posts/new/page.tsx        # 新建
│   │   │   ├── posts/[id]/page.tsx       # 编辑
│   │   │   ├── posts/actions.ts          # 文章 Server Actions + zod 校验
│   │   │   ├── tags/page.tsx             # 标签管理（KPI / 搜索 / 筛选 / 列表）
│   │   │   ├── tags/new/page.tsx         # 新建标签
│   │   │   ├── tags/[id]/page.tsx        # 编辑 + 使用统计 + 12 个月趋势
│   │   │   ├── tags/actions.ts           # 标签 Server Actions（updateTag 立即失效）
│   │   │   ├── comments/page.tsx         # 评论审核与管理表格（待审队列 / 放行 / 删除）
│   │   │   └── comments/actions.ts       # 评论审核放行 / 删除 Server Actions + 缓存失效
│   │   ├── auth/signin/page.tsx          # 登录引导页
│   │   ├── auth/callback/page.tsx        # OAuth 回调页
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── feed.xml/route.ts             # RSS（/feed.xml）
│   │   ├── sitemap.ts / robots.ts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                           # shadcn/ui
│   │   ├── blog/                         # markdown / post-card / pagination / tag-badge / view-tracker / nav-links / like-button / comments
│   │   ├── admin/                        # post-editor / post-form / tag-select / tag-form / delete-*-button / comment-actions
│   │   └── auth/                         # sign-in-button
│   ├── lib/
│   │   ├── db/ {index, schema, queries}.ts  # Drizzle 客户端 + 表结构 + 全局查询
│   │   ├── tags/ {normalize, slug}.ts       # 标签归一化与 slug 生成（纯函数，脚本复用）
│   │   ├── comments/ tree.ts                # 知乎式楼中楼树形构建算法与指向标识（纯函数 + 单测）
│   │   ├── validators/ {post, tag, comment}.ts # zod 校验 + slugify + 蜜罐 + 限流
│   │   └── site.ts / utils.ts / format-date.ts
│   ├── auth.ts                           # NextAuth 配置 + isAdmin()
│   ├── proxy.ts                          # Next 16 中间件（乐观保护 /admin）
│   └── instrumentation.ts                # 设置全局代理（HTTPS_PROXY）
├── drizzle/                              # 迁移文件（0000 建表 / 0001 标签体系 / 0002 删旧数组列 / 0003 点赞 / 0004 评论）
├── scripts/                              # backup-data / execute-sql / 已退役的 backfill-tags
├── supabase/rls.sql                      # 索引 / RLS / RPC（increment_post_views）
├── drizzle.config.ts
├── .env.local（gitignore）
└── .env.example
```

> 与原始 spec 的差异：`(admin)` 路由组改为字面量 `admin/`（路由组不产生 URL 路径）；后台路径为 `/admin`。RSS 放在 `src/app/feed.xml/route.ts`（对应 `/feed.xml`）。认证用 `src/proxy.ts`（Next 16 的 middleware 更名）。

## 5. 数据库设计（已实现）

### 5.1 表（Drizzle schema）

`posts` + `settings` + `tags` + `post_tags` + `post_likes` + `comments`（标签体系 2026-10 落地；点赞与评论体系 2026-10-16 落地，详见 `specs/spec-comments-likes.md`）。

- `posts(id, slug unique, title, excerpt, content_md, cover_image, published bool, published_at timestamptz, views int, created_at, updated_at)`
- `settings(key text pk, value jsonb)`
- `tags(id, name, normalized_key unique, slug unique, description, is_active bool, created_at, updated_at)`
- `post_tags(post_id, tag_id, position, created_at)`——联合主键；文章删除级联、标签删除受限
- `post_likes(post_id, visitor_id, created_at)`——联合主键 `(post_id, visitor_id)` 天然防刷防重；访客基于持久 Cookie UUID；文章删除级联
- `comments(id, post_id, parent_id, reply_to_id, author_name, author_url, content, status, ip_hash, created_at, updated_at)`——自引用外键树形结构：`parent_id` 始终指向楼层顶级根评论（级联删除整楼），`reply_to_id` 指向被回复的具体发言（删除置空优雅降级）；`status` 默认 `'pending'`（先审后显）；`ip_hash` 存 HMAC-SHA256(IP+UA) 用于限流
- 旧 `posts.tags` 数组列已删除（0002 迁移），标签一律走关系表

> **说明**：原 spec 的 `profiles`、`embedding`、`article_chunks` **均未建**。
> `settings` 表在 schema 中已定义，但代码里**尚未使用**（管理员身份走 `ADMIN_EMAILS` 环境变量，空表保留备用）。`published_at` 为纯应用层保证（发布时留空填 `now()`，无数据库约束）。

### 5.2 RLS + 关键 SQL（supabase/rls.sql，已就位）

- `create extension if not exists pg_trgm;`
- 模糊检索索引：`posts_title_trgm`、`posts_content_trgm`（gin + trgm_ops）；标签索引 `post_tags_tag_id_idx`、`posts_published_at_idx`
- 评论二级索引：`comments_post_created_idx`、`comments_parent_created_idx`、`comments_ip_hash_idx`、`comments_status_idx`
- 阅读量：`increment_post_views(post_id uuid)` —— `security definer` 原子自增，仅对已发布文章生效
- RLS：`posts`、`settings`、`tags`、`post_tags`、`post_likes`、`comments` 全量开启 RLS；公开读策略仅两条——`posts_public_read`（`published = true`）与 `tags_public_read`（`is_active = true`）；其余表无公开策略（不开放匿名直连）
- 读写都走服务端（Drizzle 直连用户为表 owner，绕过 RLS），写权限与反垃圾校验由 NextAuth + Server Action 在应用层统一保证；未创建任何公开写策略（非 owner 一律拒绝）

> 职责分工：**表结构由 Drizzle 迁移管理**（`pnpm db:migrate`），**RLS/索引/触发器/RPC 用 SQL 脚本**（`supabase/rls.sql`）。

## 6. 认证与权限（已实现）

1. GitHub OAuth（Auth.js / NextAuth v5），回调在 `/api/auth/[...nextauth]`
2. 单管理员：`ADMIN_EMAILS`（逗号分隔邮箱白名单），`signIn` 回调里拦截非白名单邮箱；无 `role` 表、无公开注册
3. 三层防线：`src/proxy.ts` 乐观保护 `/admin` → Server Component / Server Action 里 `isAdmin()` 校验 → 数据库 RLS（公开只读已发布）
4. 境内访问 GitHub 不稳定：`src/instrumentation.ts` 设置 undici 全局代理 dispatcher（读 `HTTPS_PROXY`/`HTTP_PROXY`）；`src/auth.ts` 里用 `customFetch` + 重试 `resilientFetch` 应对瞬时网络错误

## 7. 数据流设计（已实现）

| 操作                      | 方式                                                 |
| ------------------------- | ---------------------------------------------------- |
| 读列表/详情/标签          | Server Component 直连 Drizzle（`dynamic = "force-dynamic"`，构建期不访问数据库） |
| 增删改                    | Server Actions（`/admin/posts/actions.ts`、`/admin/tags/actions.ts`，zod 校验；文章标签在事务内按 diff 写 `post_tags`） |
| 阅读量                    | 客户端 `view-tracker.tsx` → RPC `increment_post_views` |
| 文章点赞                  | 客户端 `like-button.tsx` → Server Action `toggleLikeAction`（Cookie 访客 UUID，支持可撤销 toggle 与乐观更新） |
| 评论发表与审核            | 访客端 `addCommentAction`（蜜罐+10分钟限流+Zod，先审后显入库 pending）→ 后台 `/admin/comments` 管理放行/删除 → `revalidatePath` 触发缓存失效 |
| Auth 回调 / RSS           | Route Handlers（`/api/auth/*`、`/feed.xml`）           |

## 8. 功能清单（按优先级 + 状态）

| 阶段 | 功能                                       | 说明              | 状态 |
| ---- | ------------------------------------------ | ----------------- | ---- |
| P0   | 项目骨架 + Supabase + Drizzle + Auth + RLS | 地基              | ✅ |
| P1-1 | 文章 CRUD + 后台编辑器                     | @mdxeditor        | ✅ |
| P1-2 | 前台列表/详情 + Markdown 渲染 + 代码高亮   | react-markdown    | ✅ |
| P1-3 | 标签 + 搜索（pg_trgm）+ 分页               |                   | ✅ |
| P1-4 | 自建评论与点赞体系 + 阅读量（RPC）         | 知乎式楼中楼 + 点赞 toggle + 审核后台 | ✅（2026-10-16 落地） |
| P1-5 | 关于页 + sitemap + robots + RSS + SEO      |                   | ✅（关于页 2026-09-13 补齐） |
| P2   | Vercel 部署 + 域名                         | 已上线 www；apex 308 → www | ✅ |

> 注：原规划中的 AI 摘要 / 标签推荐 / RAG 问答已从本主规范中剥离，后续若有需要再单独立项讨论。

## 9. 环境变量（已按实际 `.env.example` 更新）

```bash
# Database —— 迁移 Direct(5432) / 运行时 Pooler(6543)
DATABASE_URL=
DATABASE_URL_POOLER=

# Auth（Auth.js / NextAuth · GitHub OAuth）
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_SECRET=                # 本地生成：npx auth secret 或 openssl rand -base64 32
AUTH_URL=http://localhost:3000

# Admin —— 唯一允许登录后台的 GitHub 邮箱（逗号分隔）
ADMIN_EMAILS=

# 代理（可选，境内访问 GitHub 用）—— 端口以本机 Clash 为准
# HTTPS_PROXY=http://127.0.0.1:7897
# HTTP_PROXY=http://127.0.0.1:7897

# Site —— SEO（sitemap/robots/RSS 的绝对域名；生产必填，未设回退 AUTH_URL 再回退 localhost:3000）
# SITE_URL=
```

> 原 spec 第 10 节旧参数（`NEXT_PUBLIC_SUPABASE_*`、`SUPABASE_SECRET_KEY` 等）**已不再使用**，已被上面的实际配置取代。

## 10. 实施路线图（进度核对）

| 编号 | 任务                                                   | 状态（2026-10-16 核对）                                                                                             |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| S1   | create-next-app 骨架，pnpm dev 跑通                    | ✅ 已完成（Next.js 16.3.3 / React 19.2.8 / pnpm）                                                                    |
| S2   | 装 Supabase + Drizzle 依赖，写客户端 + 环境变量        | ✅ 已完成（Drizzle + postgres 运行时走 pooler；`.env.example` 已按实更新）                                          |
| S3   | 创建 Supabase 项目，填真实密钥，Drizzle 建表 + rls.sql | ✅ 已完成（`drizzle/0000_condemned_gorgon.sql` + `supabase/rls.sql`；表为 `posts + settings`，无 embedding/注释表） |
| S4   | Auth（GitHub OAuth）+ proxy.ts + admin                 | ✅ 已完成（Auth.js v5 + `ADMIN_EMAILS` 白名单 + `src/proxy.ts` + instrumentation 代理 + 重试）                       |
| S5   | 文章 CRUD + 后台编辑器                                 | ✅ 已完成（CRUD + zod + slug 唯一化 + @mdxeditor 动态加载；后台表格列表 + 删除二次确认；封面图支持 URL 或上传（R2 直传，2026-09-13）） |
| S6   | 前台列表/详情 + Markdown 渲染                          | ✅ 已完成（列表/详情 + react-markdown + remark-gfm + rehype-pretty-code 代码高亮）                                   |
| S7   | 标签/搜索/分页/阅读量/评论与点赞                       | ✅ 已完成（标签体系 v1 于 2026-10 落地；自建点赞与知乎式楼中楼评论体系于 2026-10-16 落地，详见 `specs/spec-comments-likes.md`；关键词搜索/分页/阅读量/点赞均已全通） |
| S8   | SEO / RSS / 关于页                                     | ✅ 已完成（页面级 metadata + sitemap / robots / `/feed.xml` + 关于页，其中关于页为 2026-09-13 补齐）                                            |
| S9   | Vercel 部署 + 域名                                     | ✅ 已完成（Vercel + Cloudflare 上线，线上 www.jiangruijian.com；README 已于 2026-09-13 重写）                                                  |

### 执行偏差说明（相对原始 spec，已核对）

- **认证**：Supabase Auth → **Auth.js(NextAuth v5, GitHub OAuth)**；全站仅唯一管理员，`ADMIN_EMAILS` 邮箱白名单拦截，无 `role` 表、无公开注册。（已实现）
- **评论与点赞**：**自建表彻底替代 Giscus**。自建 `comments` + `post_likes` 关系表；知乎式两级扁平楼中楼（`parent_id` + `reply_to_id`，对话指向 `XXX ▶ YYY`）；可撤销点赞 toggle；先审后显队列；蜜罐防机器人 + HMAC-SHA256 IP 限流；预留 `NEXT_PUBLIC_ENABLE_COMMENTS` 备案一键隐藏开关；前台卡片与后台仪表盘/文章列表全面集成点赞统计。（2026-10-16 落地）
- **路由**：`(admin)` 路由组改为字面量 **`admin/`**，后台路径为 `/admin`；RSS 实际在 `/feed.xml`。
- **数据库表**：`posts` + `settings` + `tags` + `post_tags` + `post_likes` + `comments`（无 `profiles`）。`settings` 表已定义但**代码未使用**（管理员身份走环境变量）。标签走 `post_tags` 关系表；点赞走 `post_likes`；评论走 `comments`。
- **RLS**：公开读仅 `posts_public_read` 与 `tags_public_read`；`post_tags`、`post_likes`、`comments` 均开启 RLS 但不开放公开写入策略，写权限由 NextAuth + Server Action 统一保证。
- **代理**：`src/instrumentation.ts` 设置全局 undici 代理（读 `HTTPS_PROXY`/`HTTP_PROXY`），`src/auth.ts` 加 `customFetch` 重试。
- **封面图**：表单支持「手填 URL」与「本地上传」两种方式；上传走 **Cloudflare R2**（`cdn.jiangruijian.com`）：浏览器端压缩转 WebP → 服务端 `isAdmin()` 校验后签发预签名 PUT → 直传 R2（`Cache-Control: public, max-age=31536000, immutable`）。前台列表缩略图、文章头图、OG 图均已接入。（2026-09-13 更新）
- **后台仪表盘**：已实做（已发布 / 草稿 / 今年 / 总阅读量 / 总获赞量 5 大 KPI + 最近更新 + 热门阅读 Top 5 + 标签分布[点击直达后台标签详情] + 快捷入口）；「今年」口径按 `published_at` 统计，与前台一致（2026-10）；标签级 12 个月趋势在标签详情页。
- **依赖清理**：`@supabase/supabase-js` 已移除（2026-10 核对销账）。`babel-plugin-react-compiler` 亦已移除（reactCompiler 关闭后闲置）。
- **种子数据**：暂无 seed 脚本（`package.json` 无 `db:seed`）；`scripts/` 现有 backup-data / execute-sql / 已退役的 backfill-tags 三个运维脚本。

### 当前进度结论（2026-10-16）

**已完成并验证**：

- **S1–S9 全部完成**！博客系统全部前台浏览、后台写作发布、标签管理、自建评论与点赞闭环已彻底打通。
- 前后台核心链路可跑：前台列表 → 详情（Markdown 渲染 + 代码高亮 + 阅读量 + 点赞 + 知乎式评论回复）→ 标签/搜索/分页；后台登录（GitHub OAuth 白名单）→ 文章 CRUD → 编辑器发布 → 标签生命周期管理 → 评论放行/删除。
- SEO 三件套（sitemap / robots / RSS）+ 页面级 metadata + 关于页齐全。
- 全链路工程保障：`typecheck` / `lint` / `format:check` / `test` / `build` 全绿。

**剩余待做**：

1. **运维与生产上线**：将 `dev` 分支改动推送到远端仓库并合并上线；确认 Supabase 生产库已应用迁移 `0003`、`0004` 与 `supabase/rls.sql`。
2. **可选体验增强**：评论邮件通知（接入 Resend / Webhook 提醒博主与访客）、后台站点级趋势图表、测试 seed 脚本。

**2026-09-13 已完成**：Vercel + 自定义域名上线验证；数据库连接池抗抖动（keep_alive / 连接池单例 / 只读查询重试）；登录后回跳原页面 + 开放重定向修复；关于页补齐；阅读量 RPC 执行权限收紧。

**2026-10-06 已完成**：标签体系 v1 全量落地（关系表迁移与回填 / 归一化与 slug / 编辑器标签选择 / 后台标签管理 / 12 个月趋势 / 旧数组列删除），实施过程与验收详见 `specs/spec-tag-management.md` §20。

**2026-10-16 已完成**：自建评论与点赞系统全面交付（知乎式两级楼中楼、可撤销点赞、先审后显、反垃圾蜜罐+限流、ICP 备案开关、前后台点赞集成，五重工程质量验收全绿），详见 `specs/spec-comments-likes.md`。

## 11. 待定 / 需讨论的点

> 已解决（不再列为待定）：后台编辑器（已用 @mdxeditor）、搜索（已用 pg_trgm 关键词搜索）、评论与点赞（已自建实现，知乎式两级楼中楼，彻底放弃 Giscus）、种子数据（暂无，建议后续补）。
> 仍需讨论：

1. **评论通知渠道**：新评论提醒博主使用邮件（如 Resend）还是 IM Webhook（飞书/企业微信）？
2. **多语言**：博客是纯中文，还是要中英文切换（i18n）？
3. **后台仪表盘**：基础统计已做；标签级 12 个月趋势已在标签详情页实现（纯 CSS 条形图，无图表库）。站点级阅读量/点赞趋势是否要做、要不要引入轻量图表，再议。
4. **封面图**：已接 R2 直传 + 客户端压缩；是否需要水印、多图、边缘裁剪（Cloudflare Images 付费项）再议。
