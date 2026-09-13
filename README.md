# jiangruijian's blog

个人技术博客。全栈 Next.js 16（App Router）+ Supabase Postgres + Drizzle ORM + Auth.js（GitHub OAuth 单管理员）。
前台是面向 SEO 的服务端渲染阅读端，后台是一个带 Markdown 编辑器的内容管理界面。

- 线上地址：<https://www.jiangruijian.com>
- 设计蓝图与进度：[`specs/spec-jiangruijians-blog.md`](specs/spec-jiangruijians-blog.md)
- 部署手册（Vercel + Cloudflare + Supabase）：[`DEPLOY.md`](DEPLOY.md)

## 功能

### 前台

- **首页**：最新文章 + 站点统计（总篇数 / 今年发布 / 最近更新），支持按标签快速筛选
- **归档** `/posts`：关键词搜索（标题 + 正文，pg_trgm）、分页，搜索词在翻页时保留
- **文章详情** `/posts/[slug]`：Markdown 渲染（remark-gfm）+ Shiki 代码高亮（亮/暗双主题）、阅读时长、阅读量、标签
- **标签** `/tags`、`/tags/[tag]`：标签云（含计数）+ 标签下文章分页
- **关于** `/about`：一段话介绍（记录日常 coding 与分享）
- **SEO**：`sitemap.xml`、`robots.txt`、`/feed.xml`（RSS 全文输出）、页面级 metadata、Open Graph
- 暗色模式、移动端导航、滚动入场动画

### 后台 `/admin`

仅 `ADMIN_EMAILS` 白名单内的 GitHub 账号可登录（proxy 乐观拦截 → 布局 `isAdmin()` 校验 → Server Action 再校验，三层防线）。

- **仪表盘**：已发布 / 草稿 / 今年发布 / 总阅读量 + 最近更新 + 标签分布 + 快捷入口
- **文章管理**：列表分页、草稿与发布状态、新建 / 编辑 / 删除（二次确认）
- **编辑器**：@mdxeditor 富文本 ↔ Markdown 源码切换、工具栏（标题 / 列表 / 引用 / 链接 / 图片 / 代码块 / 表格 / 分割线）、字数与阅读时长统计
- **校验**：zod（标题 / slug / 摘要 / 封面 URL / 正文 / 标签数量），slug 自动生成与唯一化；写操作后统一失效前台缓存

## 技术栈

| 层     | 选型                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 框架   | Next.js 16（App Router / Server Components / Server Actions）+ TypeScript                               |
| UI     | Tailwind CSS 4 + shadcn/ui（Button / Input / Textarea / Label / Checkbox） + lucide-react + next-themes |
| 数据库 | Supabase Postgres（运行时走连接池 6543，迁移走直连 5432）+ pg_trgm                                      |
| 图片   | Cloudflare R2（`cdn.jiangruijian.com`，预签名直传 + 边缘缓存一年）                                      |
| ORM    | Drizzle ORM + postgres.js                                                                               |
| 认证   | Auth.js（NextAuth v5）· GitHub OAuth + `ADMIN_EMAILS` 白名单                                            |
| 渲染   | react-markdown + remark-gfm + rehype-pretty-code（Shiki）                                               |
| 编辑   | @mdxeditor/editor                                                                                       |
| 部署   | Vercel（托管）+ Cloudflare（DNS / CDN）                                                                 |

## 快速开始

```bash
pnpm install

cp .env.example .env.local     # 填入真实值（见下）
pnpm db:migrate                # 建表（用 DATABASE_URL 直连 5432）

# 再在 Supabase SQL Editor 执行 supabase/rls.sql（索引 / RLS / 阅读量 RPC）

pnpm dev                       # http://localhost:3000
```

> 本地若无法直连 GitHub（OAuth 换 token 超时），在 `.env.local` 里配置 `HTTPS_PROXY` / `HTTP_PROXY`；`src/instrumentation.ts` 会让服务端 fetch 走代理。

### 环境变量

见 [`.env.example`](.env.example)，主要分组：

- **数据库**：`DATABASE_URL`（直连 5432，迁移用）、`DATABASE_URL_POOLER`（连接池 6543，运行时用）
- **认证**：`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`、`AUTH_SECRET`、`AUTH_URL`
- **管理员**：`ADMIN_EMAILS`（逗号分隔）
- **站点**：`SITE_URL`（sitemap / robots / RSS 用的绝对域名）
- **代理（可选）**：`HTTPS_PROXY`、`HTTP_PROXY`

## 常用脚本

| 命令                                                    | 说明                                  |
| ------------------------------------------------------- | ------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`                | 开发 / 构建 / 生产启动                |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check`    | ESLint / TS / Prettier（CI 全部会跑） |
| `pnpm format`                                           | 按 Prettier 格式化全仓库              |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:push` | Drizzle 迁移                          |

CI（`.github/workflows/ci.yml`）在 push / PR 时执行：format check → lint → typecheck → build。

## 目录结构

```
src/
├── app/
│   ├── (blog)/          # 前台：首页 / 列表 / 详情 / 标签 / 错误页
│   ├── admin/           # 后台：仪表盘 + 文章 CRUD（Server Actions）
│   ├── auth/            # 登录引导页 + OAuth 回调页
│   ├── api/auth/        # Auth.js 路由
│   ├── feed.xml/        # RSS
│   └── sitemap.ts / robots.ts
├── components/          # blog / admin / auth / ui
├── lib/
│   ├── db/              # Drizzle 客户端、schema、查询、搜索词处理
│   └── validators/      # zod 校验 + slugify
├── auth.ts              # NextAuth 配置 + isAdmin()
├── proxy.ts             # Next 16 中间件（/admin 乐观保护）
└── instrumentation.ts   # 全局代理（境内访问 GitHub 用）
drizzle/                 # 迁移文件
supabase/rls.sql         # 索引 / RLS / 阅读量 RPC（手工执行）
```

## 数据流

| 操作            | 方式                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| 前台读列表/详情 | Server Component 直连 Drizzle（`force-dynamic`，构建期不访问数据库）   |
| 缓存            | `unstable_cache` + `posts` tag，60s 重新验证；写操作后 `revalidateTag` |
| 增删改          | Server Actions（zod 校验 + `isAdmin()`）                               |
| 阅读量          | 客户端 `ViewTracker` → Server Action → `increment_post_views` RPC      |
| Auth 回调 / RSS | Route Handlers                                                         |

## 已知事项 / 待办

- **评论**：尚未接入（计划 Giscus）
- **AI / RAG**：尚未开始（需先定 embedding 模型与维度，再建 `article_chunks` + pgvector）
- **阅读量防刷**：已在数据库侧收紧——`increment_post_views` 仅保留表 owner 与 `service_role` 可执行（`anon` / `authenticated` 已 revoke，见 `supabase/rls.sql`）
- **封面图**：已接 Cloudflare R2 —— 后台选图 → 浏览器压缩转 WebP（长边 1600）→ 预签名直传 R2 → 前台列表/详情/OG 展示；也可继续手填外链 URL
- **本地连接抖动**：经代理链路时空闲数据库连接可能被静默丢弃；已用 `keep_alive` + 连接池单例 + 只读查询重试缓解，彻底解决可在代理里给 `*.supabase.com` 加直连规则
