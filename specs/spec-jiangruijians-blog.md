# jiangruijian's blog —— 博客系统 Spec v3（定稿讨论版）

> 定位：个人技术博客 + AI 知识问答（RAG）。本项目由作者亲自搭建，本 spec 作为实现蓝图与讨论依据。

## 1. 项目概述

| 项     | 值                                                     |
| ------ | ------------------------------------------------------ |
| 项目名 | jiangruijian's blog                                    |
| 定位   | 个人技术博客 + AI 问答（RAG）                          |
| 部署   | Vercel（Hobby 免费版）                                 |
| 数据库 | Supabase（PostgreSQL + pgvector）                      |
| 认证   | Supabase Auth（GitHub OAuth）+ Row Level Security      |
| 包管理 | pnpm / Node 22+                                        |
| 写作   | 文章正文入 Supabase 数据库（Markdown），后台编辑器发布 |

## 2. 技术栈

| 类别   | 技术                                             | 说明                                               |
| ------ | ------------------------------------------------ | -------------------------------------------------- |
| 框架   | Next.js 16（App Router）+ TypeScript             | 全栈，前端 + Serverless 后端一体                   |
| UI     | Tailwind CSS 4 + shadcn/ui                       | 快速搭界面                                         |
| ORM    | Drizzle ORM + postgres.js                        | SQL-first，配 Supabase                             |
| 数据库 | Supabase Postgres + pgvector + pg_trgm           | 存储 + 向量检索 + 模糊搜索                         |
| 认证   | Supabase Auth（GitHub OAuth）+ @supabase/ssr     | 会话走 cookie，RLS 兜底                            |
| 编辑   | @mdxeditor/editor                                | 后台 Markdown 编辑器                               |
| 渲染   | react-markdown + remark-gfm + rehype-pretty-code | 正文渲染 + 代码高亮                                |
| 存储   | Supabase Storage                                 | 封面图                                             |
| 实时   | Supabase Realtime                                | 评论实时刷新（可选）                               |
| AI     | Vercel AI SDK v7 + @ai-sdk/openai                | 可切 DeepSeek / 通义；embedding 走通义/SiliconFlow |

## 3. 架构决策（已定）

| 决策               | 结论                                             | 理由                                                                |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| 全栈还是前后端分离 | **Next.js 全栈，不分离**                         | 博客重 SEO + SSR，分离是负优化（详见讨论）                          |
| 上 Cloudflare？    | **保留 Vercel**                                  | Vercel + Supabase 最省心；Cloudflare 需 OpenNext 适配，不必为换而换 |
| 数据库/认证        | **Supabase（不是 Neon + Auth.js）**              | 认证/Storage/Realtime/RLS 开箱即用                                  |
| 文章存哪           | **正文入数据库（Markdown），不用 content/ 目录** | 为后期 AI 功能（RAG/向量/语义搜索）铺路                             |
| 内容格式           | **Markdown（不是 MDX）**                         | 渲染更简单安全；如需文章内嵌 React 组件再升级 MDX                   |
| 后台编辑器         | @mdxeditor（Markdown 编辑器）                    | 写作体验好；它本质是 Markdown 编辑器                                |

## 4. 目录结构

```
jiangruijians-blog/
├── src/
│   ├── app/
│   │   ├── (blog)/
│   │   │   ├── layout.tsx              # 前台布局（导航/页脚）
│   │   │   ├── page.tsx                # 首页（精选文章）
│   │   │   ├── posts/page.tsx          # 文章列表 + 分页 + 搜索
│   │   │   ├── posts/[slug]/page.tsx   # 文章详情（Markdown 渲染）
│   │   │   ├── tags/[tag]/page.tsx     # 标签聚合
│   │   │   └── about/page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx              # 后台布局 + 登录校验
│   │   │   ├── page.tsx                # 仪表盘
│   │   │   ├── posts/page.tsx          # 文章管理列表
│   │   │   ├── posts/new/page.tsx      # 新建
│   │   │   └── posts/[id]/page.tsx     # 编辑
│   │   ├── auth/callback/route.ts      # GitHub OAuth 回调
│   │   ├── api/ai/
│   │   │   ├── summarize/route.ts
│   │   │   ├── tags/route.ts
│   │   │   └── chat/route.ts           # RAG 流式
│   │   ├── sitemap.ts / robots.ts
│   │   ├── feed/route.ts               # RSS
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                         # shadcn/ui
│   │   ├── blog/                       # post-card / post-list / tag-badge / markdown.tsx
│   │   └── admin/                      # post-editor.tsx / post-form.tsx / dashboard-stats.tsx
│   ├── lib/
│   │   ├── supabase/ {client,server,admin}.ts
│   │   ├── db/ {schema,index}.ts
│   │   ├── validators/
│   │   └── utils.ts
│   └── proxy.ts                        # Next 16 中间件（会话刷新 + 保护 /admin）
├── drizzle/                            # 迁移文件
├── supabase/rls.sql                    # 索引/RLS/触发器/RPC
├── drizzle.config.ts
├── .env.local（gitignore）
└── .env.example
```

## 5. 数据库设计

### 5.1 表（Drizzle schema）

- `profiles(id, email, role['visitor'|'admin'], created_at)`
- `posts(id, slug, title, excerpt, content_md, cover_image, tags[], published, views, embedding vector, created_at, updated_at)`
- `comments(id, post_id, author_id, body, created_at)`
- `settings(key, value jsonb)`
- `article_chunks(post_id, chunk_index, content, embedding)` —— 后期 RAG 用

### 5.2 RLS + 关键 SQL（supabase/rls.sql）

```sql
create extension if not exists vector;
create extension if not exists pg_trgm;
create index if not exists posts_title_trgm on posts using gin (title gin_trgm_ops);
create index if not exists posts_content_trgm on posts using gin (content gin_trgm_ops);

-- 新用户自动建 profile
create or replace function public.handle_new_user() ...;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table profiles enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;

-- posts：已发布公开可读；仅 admin 可写
create policy "posts_public_read" on posts for select using (published = true);
create policy "posts_admin_all" on posts for all
  using (exists (select 1 from profiles where id = auth.uid() and role='admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role='admin'));

-- 阅读量：security definer 函数原子自增，避免开放 posts.update
create or replace function public.increment_post_views(post_id uuid) returns void ...;
```

> 职责分工：**表结构由 Drizzle 迁移管理**（`pnpm db:migrate`），**RLS/索引/触发器/RPC 用 SQL 脚本**（Drizzle 不易表达）。

## 6. 认证与权限（Supabase Auth + RLS）

1. GitHub OAuth（Supabase Auth Providers）
2. 三层防线：`proxy.ts` 路由保护 → Server Component/Server Action 里 `getUser()` 校验 → 数据库 RLS
3. 首次登录后在 `profiles` 表把自己设为 `admin`

## 7. 数据流设计（现代 Next.js）

| 操作                      | 方式                                                 |
| ------------------------- | ---------------------------------------------------- |
| 读列表/详情/标签          | Server Component 直连 Drizzle（支持 revalidate/ISR） |
| 增删改                    | Server Actions                                       |
| 评论发表                  | Server Action 或客户端直连 Supabase + RLS            |
| 评论实时                  | 客户端 Supabase Realtime                             |
| Auth 回调 / RSS / AI 流式 | Route Handlers（/api/*）                             |

## 8. 功能清单（按优先级）

| 阶段 | 功能                                       | 说明              |
| ---- | ------------------------------------------ | ----------------- |
| P0   | 项目骨架 + Supabase + Drizzle + Auth + RLS | 地基              |
| P1-1 | 文章 CRUD + 后台编辑器                     | @mdxeditor        |
| P1-2 | 前台列表/详情 + Markdown 渲染 + 代码高亮   | react-markdown    |
| P1-3 | 标签 + 搜索（pg_trgm）+ 分页               |                   |
| P1-4 | 评论 + 阅读量（RPC）                       | Realtime 可选     |
| P1-5 | 关于页 + sitemap + robots + RSS + SEO      |                   |
| P2   | AI：摘要 / 标签推荐 / RAG 问答             | 定 embedding 模型 |
| P3   | Vercel 部署 + 域名                         |                   |

## 9. AI / RAG 设计

```
文章保存 → 调 embedding API → 存 posts.embedding
用户提问 → embedding API → pgvector 余弦检索
        → 拼接上下文 → Vercel AI SDK 流式输出
```

- **Embedding 选型**：通义 `text-embedding-v3`（1024 维，国内可访问）或 SiliconFlow；OpenAI `text-embedding-3-small`（1536 维）
- **注意**：`pgvector` 列维度必须与所选模型一致，定好勿改
- **LLM**：OpenAI / DeepSeek / 通义，通过 `AI_BASE_URL` + `AI_MODEL` 切换

## 10. 环境变量

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=                 # 仅服务端

# Database —— 迁移 Direct(5432) / 运行时 Pooler(6543)
DATABASE_URL=
DATABASE_URL_POOLER=

# AI
OPENAI_API_KEY=                        # 或 DEEPSEEK_API_KEY / DASHSCOPE_API_KEY
# AI_BASE_URL=
# AI_MODEL=
```

## 11. 实施路线图

| 编号 | 任务                                                   | 状态                                             |
| ---- | ------------------------------------------------------ | ------------------------------------------------ |
| S1   | create-next-app 骨架，pnpm dev 跑通                    | ✅ 已完成                                        |
| S2   | 装 Supabase + Drizzle 依赖，写客户端 + 环境变量        | ✅ 已完成                                        |
| S3   | 创建 Supabase 项目，填真实密钥，Drizzle 建表 + rls.sql | ✅ 已完成（表/RLS/RPC 已就位）                   |
| S4   | Auth（GitHub OAuth）+ proxy.ts + admin                 | ✅ 已完成（改用 NextAuth；单管理员，邮箱白名单） |
| S5   | 文章 CRUD + 后台编辑器                                 | ✅ 已完成（封面图字段未接入表单，见偏差说明）    |
| S6   | 前台列表/详情 + Markdown 渲染                          | 待做                                             |
| S7   | 标签/搜索/分页/阅读量/评论                             | ⬜ 待做（pg_trgm 索引/阅读量 RPC 已提前铺好；评论改走 Giscus） |
| S8   | SEO / RSS / 关于页                                     | 待做                                             |
| S9   | AI 摘要/标签/RAG                                       | ⏸ 延后（暂不做）                                 |
| S10  | Vercel 部署 + 域名                                     | 待做                                             |

### 执行偏差说明（相对原始 spec）

- **认证**：Supabase Auth → **Auth.js(NextAuth v5, GitHub OAuth)**；全站仅唯一管理员，`ADMIN_EMAILS` 邮箱白名单拦截，无 `role` 表、无公开注册。
- **AI**：整体延后（不建 `embedding`/`article_chunks`/`api/ai/*`）。
- **评论**：后续走 Giscus（第三方），不建自建 `comments` 表。
- **路由**：`(admin)` 路由组改为字面量 **`admin/`**（路由组不产生 URL 路径），后台路径为 `/admin`。
- **数据库表**：实际为 `posts` + `settings`（无 `profiles`）。
- **RLS**：改为"**已发布文章公开可读** + 服务端表 owner 绕过 RLS"；不再依赖 `auth.jwt()`（因已不用 Supabase Auth）。
- **代理**：境内访问 GitHub 不稳定，已加 `instrumentation` + `customFetch` 重试，通过 `HTTPS_PROXY` 走本地代理。
- **S5 已完工**：CRUD 全链路（列表/新建/编辑/删除 + zod 校验 + slug 唯一化 + @mdxeditor 动态加载）已实现；唯一缺口：schema 已有 `cover_image` 字段，但表单未接入上传/输入。

## 12. 待定 / 需讨论的点

1. **后台编辑器**：用 @mdxeditor 还是先用简单 textarea？@mdxeditor 体验好但依赖较重。
2. **评论 Realtime**：要实时刷新吗？还是普通提交刷新即可（实现更简单）？
3. **搜索**：第一阶段用 pg_trgm 关键词搜索，还是直接上 RAG 语义搜索？
4. **AI 优先级**：摘要 / 标签推荐 / RAG 问答，先做哪个？embedding 用通义还是 OpenAI？
5. **多语言**：博客是纯中文，还是要中英文切换（i18n）？
6. **数据/后台**：需要后台仪表盘（阅读量图表、文章统计）吗？
7. **种子数据**：要不要写一个 seed 脚本，生成几篇示例文章方便调试？
