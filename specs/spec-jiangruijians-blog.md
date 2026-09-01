# jiangruijian's blog —— 博客系统 Spec v3（定稿讨论版 + 进度核对）

> 定位：个人技术博客 + AI 知识问答（RAG）。本项目由作者亲自搭建，本 spec 作为实现蓝图与讨论依据。

> **进度核对时间：2026-09-01**。本章节基于对 `src/`、`drizzle/`、`supabase/rls.sql`、`.env.example`、`package.json` 的实际代码核对，更新了路线图与「实现偏差说明」，并修正了正文中与实现不一致的旧描述（如封面图已接入、认证已改用 Auth.js、数据库表为 `posts + settings` 等）。

## 1. 项目概述

| 项     | 值                                                     |
| ------ | ------------------------------------------------------ |
| 项目名 | jiangruijian's blog                                    |
| 定位   | 个人技术博客 + AI 问答（RAG）                          |
| 部署   | Vercel（Hobby 免费版）                                 |
| 数据库 | Supabase（PostgreSQL + pgvector）                      |
| 认证   | **Auth.js（NextAuth v5, GitHub OAuth）** + 管理员白名单（已实现；不等同于原 spec 的 Supabase Auth） |
| 包管理 | pnpm / Node 22+                                        |
| 写作   | 文章正文入 Supabase 数据库（Markdown），后台编辑器发布 |

## 2. 技术栈

| 类别   | 技术                                             | 说明                                               |
| ------ | ------------------------------------------------ | -------------------------------------------------- |
| 框架   | Next.js 16（App Router）+ TypeScript             | 全栈，前端 + Serverless 后端一体                   |
| UI     | Tailwind CSS 4 + shadcn/ui                       | 快速搭界面                                         |
| ORM    | Drizzle ORM + postgres.js                        | SQL-first，配 Supabase                             |
| 数据库 | Supabase Postgres + pg_trgm                      | 存储 + 模糊检索；**pgvector 列暂未建**（AI 延后）  |
| 认证   | **Auth.js(NextAuth v5) + GitHub OAuth + ADMIN_EMAILS 白名单** | 会话走 cookie；已实现。原 spec 的 Supabase Auth 未采用 |
| 编辑   | @mdxeditor/editor                                | 后台 Markdown 编辑器（已接入 toolbar + placeholder）|
| 渲染   | react-markdown + remark-gfm + rehype-pretty-code | 正文渲染 + 代码高亮（shiki）                        |
| 存储   | **暂未接 Supabase Storage**                      | 封面图目前以「URL 字段」入库，可留空；上传未做     |
| 实时   | **未接入 Supabase Realtime**                     | 评论未做；后续走 Giscus（第三方）                   |
| AI     | **延后**                                         | 未引入 AI 依赖、无 `api/ai/*`；embedding 模型未定   |

> 注：`package.json` 中仍装有 `@supabase/supabase-js`，但代码里**未实际使用**（无 `lib/supabase/*`，运行时直连 Drizzle + postgres）。可后续清理或留作 Storage 上传用。

## 3. 架构决策（已定）

| 决策               | 结论                                             | 理由                                                                |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| 全栈还是前后端分离 | **Next.js 全栈，不分离**                         | 博客重 SEO + SSR，分离是负优化（详见讨论）                          |
| 上 Cloudflare？    | **保留 Vercel**                                  | Vercel + Supabase 最省心；Cloudflare 需 OpenNext 适配，不必为换而换 |
| 数据库/认证        | **数据库用 Supabase；认证改用 Auth.js**          | 认证/Storage/Realtime 开箱即用；但最终用 NextAuth 实现单管理员      |
| 文章存哪           | **正文入数据库（Markdown），不用 content/ 目录** | 为后期 AI 功能（RAG/向量/语义搜索）铺路                             |
| 内容格式           | **Markdown（不是 MDX）**                         | 渲染更简单安全；如需文章内嵌 React 组件再升级 MDX                   |
| 后台编辑器         | @mdxeditor（Markdown 编辑器）                    | 写作体验好；它本质是 Markdown 编辑器                                |

## 4. 目录结构（已实现）

```
jiangruijians-blog/
├── src/
│   ├── app/
│   │   ├── (blog)/                       # 前台（导航/页脚 layout）
│   │   │   ├── layout.tsx                # 前台布局
│   │   │   ├── page.tsx                  # 首页（最新文章）
│   │   │   ├── posts/page.tsx            # 文章列表 + 搜索 + 分页
│   │   │   ├── posts/[slug]/page.tsx     # 文章详情（Markdown 渲染）
│   │   │   ├── posts/[slug]/actions.ts   # 阅读量视图 RPC 触发
│   │   │   ├── tags/[tag]/page.tsx       # 标签聚合 + 分页
│   │   │   ├── about/page.tsx
│   │   │   ├── error.tsx / not-found.tsx
│   │   ├── admin/                        # 后台（字面量路径 /admin）
│   │   │   ├── layout.tsx                # 后台布局 + 登录校验
│   │   │   ├── page.tsx                  # 仪表盘（骨架）
│   │   │   ├── posts/page.tsx            # 文章管理表格 + 删除
│   │   │   ├── posts/new/page.tsx        # 新建
│   │   │   ├── posts/[id]/page.tsx       # 编辑
│   │   │   └── posts/actions.ts          # Server Actions + zod 校验
│   │   ├── auth/signin/page.tsx          # 登录引导页
│   │   ├── auth/callback/page.tsx        # OAuth 回调页
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── feed.xml/route.ts             # RSS（/feed.xml）
│   │   ├── sitemap.ts / robots.ts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                           # shadcn/ui
│   │   ├── blog/                         # markdown / post-card / pagination / tag-badge / view-tracker / nav-links
│   │   ├── admin/                        # post-editor / post-form / delete-post-button / mdx-editor
│   │   └── auth/                         # sign-in-button
│   ├── lib/
│   │   ├── db/ {index, schema, queries}.ts  # Drizzle 客户端 + 表结构 + 查询
│   │   ├── validators/post.ts            # zod 校验 + slugify
│   │   └── site.ts / utils.ts / format-date.ts
│   ├── auth.ts                           # NextAuth 配置 + isAdmin()
│   ├── proxy.ts                          # Next 16 中间件（乐观保护 /admin）
│   └── instrumentation.ts                # 设置全局代理（HTTPS_PROXY）
├── drizzle/                              # 迁移文件（0000_condemned_gorgon.sql + meta）
├── supabase/rls.sql                      # 索引 / RLS / RPC（increment_post_views）
├── drizzle.config.ts
├── .env.local（gitignore）
└── .env.example
```

> 与原始 spec 的差异：`(admin)` 路由组改为字面量 `admin/`（路由组不产生 URL 路径）；后台路径为 `/admin`。RSS 放在 `src/app/feed.xml/route.ts`（对应 `/feed.xml`）。认证用 `src/proxy.ts`（Next 16 的 middleware 更名）。

## 5. 数据库设计（已实现）

### 5.1 表（Drizzle schema）

仅有：`posts` + `settings`。

- `posts(id, slug unique, title, excerpt, content_md, cover_image, tags text[], published bool, views int, created_at, updated_at)`
- `settings(key text pk, value jsonb)`

> **说明**：原 spec 的 `profiles`、`comments`、`embedding`、`article_chunks` **均未建**。
> `settings` 表在 schema 中已定义，但代码里**尚未使用**（管理员身份走 `ADMIN_EMAILS` 环境变量，空表保留备用）。`posts` 也**没有 `embedding` 向量列**（AI/RAG 延后）。

### 5.2 RLS + 关键 SQL（supabase/rls.sql，已就位）

- `create extension if not exists pg_trgm;`
- 模糊检索索引：`posts_title_trgm`、`posts_content_trgm`（gin + trgm_ops）；标签 `posts_tags_gin`（gin tags）
- 阅读量：`increment_post_views(post_id uuid)` —— `security definer` 原子自增，仅对已发布文章生效
- RLS：`posts`、`settings` 开启 RLS；仅"已发布文章公开可读"策略（`posts_public_read` 用 `published = true`）
- 读写都走服务端（Drizzle 直连用户为表 owner，绕过 RLS），写权限由 NextAuth + Server Action 在应用层保证；未创建任何写策略（非 owner 一律拒绝）

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
| 增删改                    | Server Actions（`/admin/posts/actions.ts`，zod 校验） |
| 阅读量                    | 客户端 `view-tracker.tsx` → RPC `increment_post_views` |
| 评论发表                  | **未做**；后续走 Giscus（第三方组件）                  |
| 评论实时                  | **未做**（无 Supabase Realtime）                      |
| Auth 回调 / RSS           | Route Handlers（`/api/auth/*`、`/feed.xml`）           |

## 8. 功能清单（按优先级 + 状态）

| 阶段 | 功能                                       | 说明              | 状态 |
| ---- | ------------------------------------------ | ----------------- | ---- |
| P0   | 项目骨架 + Supabase + Drizzle + Auth + RLS | 地基              | ✅ |
| P1-1 | 文章 CRUD + 后台编辑器                     | @mdxeditor        | ✅ |
| P1-2 | 前台列表/详情 + Markdown 渲染 + 代码高亮   | react-markdown    | ✅ |
| P1-3 | 标签 + 搜索（pg_trgm）+ 分页               |                   | ✅ |
| P1-4 | 评论 + 阅读量（RPC）                       | 评论改走 Giscus   | ⚠️ 阅读量✅ / 评论未做 |
| P1-5 | 关于页 + sitemap + robots + RSS + SEO      |                   | ✅ |
| P2   | AI：摘要 / 标签推荐 / RAG 问答             | 定 embedding 模型 | ⏸ 延后 |
| P3   | Vercel 部署 + 域名                         |                   | ⏳ 待做 |

## 9. AI / RAG 设计（暂缓）

```
文章保存 → 调 embedding API → 存 posts.embedding   # 目前无 embedding 列
用户提问 → embedding API → pgvector 余弦检索        # 未实现
        → 拼接上下文 → Vercel AI SDK 流式输出        # 未实现
```

- **Embedding 选型**：通义 `text-embedding-v3`（1024 维，国内可访问）或 SiliconFlow；OpenAI `text-embedding-3-small`（1536 维）
- **注意**：`pgvector` 列维度必须与所选模型一致，定好勿改
- **LLM**：OpenAI / DeepSeek / 通义，通过 `AI_BASE_URL` + `AI_MODEL` 切换

## 10. 环境变量（已按实际 `.env.example` 更新）

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

> 原 spec 第 10 节（`NEXT_PUBLIC_SUPABASE_*`、`SUPABASE_SECRET_KEY`、`OPENAI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`）**已不再使用**，已被上面的实际配置取代。

## 11. 实施路线图（进度核对）

| 编号 | 任务                                                   | 状态（2026-09-01 核对）                                                                                             |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| S1   | create-next-app 骨架，pnpm dev 跑通                    | ✅ 已完成（Next.js 16.3.3 / React 19.2.8 / pnpm）                                                                    |
| S2   | 装 Supabase + Drizzle 依赖，写客户端 + 环境变量        | ✅ 已完成（Drizzle + postgres 运行时走 pooler；`.env.example` 已按实更新）                                          |
| S3   | 创建 Supabase 项目，填真实密钥，Drizzle 建表 + rls.sql | ✅ 已完成（`drizzle/0000_condemned_gorgon.sql` + `supabase/rls.sql`；表为 `posts + settings`，无 embedding/注释表） |
| S4   | Auth（GitHub OAuth）+ proxy.ts + admin                 | ✅ 已完成（Auth.js v5 + `ADMIN_EMAILS` 白名单 + `src/proxy.ts` + instrumentation 代理 + 重试）                       |
| S5   | 文章 CRUD + 后台编辑器                                 | ✅ 已完成（CRUD + zod + slug 唯一化 + @mdxeditor 动态加载；后台表格列表 + 删除二次确认；封面图已以 URL 字段接入表单） |
| S6   | 前台列表/详情 + Markdown 渲染                          | ✅ 已完成（列表/详情 + react-markdown + remark-gfm + rehype-pretty-code 代码高亮）                                   |
| S7   | 标签/搜索/分页/阅读量/评论                             | ⚠️ 大部分完成（标签聚合/关键词搜索/分页/阅读量已做；**评论未做，Giscus 尚未接入**）                                  |
| S8   | SEO / RSS / 关于页                                     | ✅ 已完成（关于页 + 页面级 metadata；sitemap / robots / `/feed.xml` RSS）                                            |
| S9   | AI 摘要/标签/RAG                                       | ⏸ 延后（无 AI 依赖、无 `api/ai/*`、无 embedding 列）                                                                |
| S10  | Vercel 部署 + 域名                                     | ⏳ 待做（仓库内暂无 Vercel 配置，README 仍为 create-next-app 默认）                                                  |

### 执行偏差说明（相对原始 spec，已核对）

- **认证**：Supabase Auth → **Auth.js(NextAuth v5, GitHub OAuth)**；全站仅唯一管理员，`ADMIN_EMAILS` 邮箱白名单拦截，无 `role` 表、无公开注册。（已实现）
- **AI**：整体延后。未建 `embedding`/`article_chunks`，无 `api/ai/*`，`package.json` 无 AI 依赖。
- **评论**：**尚未实现**，规划走 Giscus（第三方）；未建自建 `comments` 表，也未接入 Giscus 组件。
- **路由**：`(admin)` 路由组改为字面量 **`admin/`**，后台路径为 `/admin`；RSS 实际在 `/feed.xml`。
- **数据库表**：实际为 `posts` + `settings`（无 `profiles`/`comments`）。`settings` 表已定义但**代码未使用**（管理员身份走环境变量）。
- **RLS**：改为"**已发布文章公开可读** + 服务端表 owner 绕过 RLS"；仅 `posts`/`settings` 开启 RLS，未建写策略；写权限由 NextAuth + Server Action 保证。
- **代理**：`src/instrumentation.ts` 设置全局 undici 代理（读 `HTTPS_PROXY`/`HTTP_PROXY`），`src/auth.ts` 加 `customFetch` 重试。
- **封面图**：已以「URL 字段」接入后台表单（可留空，非空须有效 URL）；**Supabase Storage 上传仍未接**。（修正：原 S5 备注「封面图字段未接入表单」已过时）
- **后台仪表盘**：`/admin` 页面仍为骨架（"后台骨架已就绪"），尚未做阅读量图表/统计。
- **依赖清理**：`@supabase/supabase-js` 已安装但**未被代码引用**（未建 `lib/supabase/*`），可后续清理。
- **种子数据**：暂无 seed 脚本（`package.json` 无 `db:seed`，仓库内无 `scripts/`），需手工建档或后续补充。

### 当前进度结论（2026-09-01）

**已完成并验证**：

- S1–S6、S8 全部完成；S7 除评论外已全部完成（标签/搜索/分页/阅读量）。
- 前后台核心链路可跑：前台列表 → 详情（Markdown 渲染 + 代码高亮 + 阅读量）→ 标签/搜索/分页；后台登录（GitHub OAuth 白名单）→ 文章 CRUD → 编辑器发布。
- SEO 三件套（sitemap / robots / RSS）+ 关于页 + 页面级 metadata 齐全。

**剩余待做**：

1. **评论**：接入 Giscus（配置 repo/theme 等），并在文章详情页挂载组件。
2. **AI（延后）**：若启动，需先建 `embedding` 向量列与 `article_chunks`，定 embedding 模型与维度，再加 `api/ai/*`。
3. **Vercel 部署 + 域名**：配置 `SITE_URL`、`AUTH_URL`、生产环境变量（含 GitHub OAuth 回调域名），绑定自定义域名，部署验证。
4. **可选**：后台仪表盘统计、Supabase Storage 封面上传、清理未使用的 `@supabase/supabase-js`、写 seed 脚本。

## 12. 待定 / 需讨论的点

> 已解决（不再列为待定）：后台编辑器（已用 @mdxeditor）、搜索（已用 pg_trgm 关键词搜索）、种子数据（暂无，建议后续补）。
> 仍需讨论：

1. **评论**：Giscus 的 repo 用哪个（建议独立仓库 `jiangruijian/blog-comments`）？是否要暗色模式适配？
2. **AI 优先级**：摘要 / 标签推荐 / RAG 问答，先做哪个？embedding 用通义还是 OpenAI？pgvector 维度何时定稿（定好勿改）。
3. **多语言**：博客是纯中文，还是要中英文切换（i18n）？
4. **后台仪表盘**：是否需要阅读量图表、文章统计？若需要，用 `recharts` 还是 `@tremor/react`？
5. **封面图**：先维持 URL 字段，还是尽快接 Supabase Storage 上传（含图片压缩/水印）？
