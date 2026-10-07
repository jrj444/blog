# 评论与点赞体系 Spec v1.0

> 状态：Draft v1.0（待评审）
> 日期：2026-10-07
> 关联文档：`specs/spec-jiangruijians-blog.md`、`specs/spec-tag-management.md`
> 目标：文章获得评论与点赞能力。**自建表实现，不使用 Giscus**（决策：不依赖 GitHub Discussions，数据自主可控）。

**已确认决策（2026-10-07，需求方）：**

| 决策项 | 结论 |
| --- | --- |
| 评论身份 | **匿名昵称制**——昵称必填，主页链接选填；不做登录、无 GitHub 徽章 |
| 发布策略 | **先审后显**——新评论进 `pending` 队列，后台放行后前台可见 |
| 回复层级 | **一级回复**——可回复某条已通过的顶级评论，不再嵌套 |
| 点赞行为 | **可撤销 toggle**——心形按钮再点一次取消；访客身份为持久 cookie 随机 UUID，不采集 IP/指纹 |
| 反垃圾 | 蜜罐字段 + IP 哈希限流（10 分钟 3 条）+ 后台人工删除；不上 Akismet/验证码 |
| 通知 | v1 不做邮件通知（无 SMTP 基础设施） |

---

## 1. 摘要

新增 `comments` 与 `post_likes` 两表。评论走「提交 → 待审 → 后台放行 → 前台展示」链路，支持对已通过顶级评论的一级回复；点赞为匿名访客可撤销的 toggle。写入全部经 Server Action（owner 绕过 RLS + 应用层校验，与现有写路径同口径），两表 RLS 开启但不建公开策略。

## 2. 目标与非目标

### 2.1 目标

- 访客在文章页提交评论（昵称 / 主页选填 / 内容），先审后显；
- 支持对已通过评论的一级回复（展示为缩进 + 「@昵称」）；
- 后台评论管理：待审队列、放行、删除（含级联删除其回复）、状态筛选；
- 文章页点赞按钮：匿名可赞可取消，实时计数；
- 反垃圾三件套：蜜罐字段、IP 哈希限流（10 分钟 3 条）、人工审核兜底。

### 2.2 非目标（v1 明确不做）

- 评论邮件通知（无 SMTP/Resend 基础设施，后续独立变更）；
- 多级嵌套回复、评论编辑、评论点赞（只给文章点赞）；
- 评论内容 Markdown 渲染（纯文本 + 换行展示，防注入面最小化）；
- GitHub 登录评论 / 认证徽章；
- 敏感词自动过滤（人工审核兜底）；
- 附件/图片评论。

## 3. 数据库设计（Drizzle schema，迁移 0003）

### 3.1 `comments`

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | |
| `post_id` | `uuid` | FK `posts.id` ON DELETE CASCADE | |
| `parent_id` | `uuid` | NULL，自引用 FK ON DELETE CASCADE | 仅指向**顶级已通过**评论；NULL = 顶级 |
| `author_name` | `text` | NOT NULL | 1–30 字（trim 后） |
| `author_url` | `text` | NULL | 选填主页，http(s) 校验，≤200 |
| `content` | `text` | NOT NULL | 1–1000 字（trim 后） |
| `status` | `text` | NOT NULL, `'pending'` | `pending` / `approved` |
| `ip_hash` | `text` | NOT NULL | HMAC-SHA256(IP+UA, AUTH_SECRET)，**不存原始 IP**；仅用于限流与封禁排查 |
| `created_at` | `timestamptz` | NOT NULL, now() | |

索引：`(post_id, created_at)`（前台列表）、`(ip_hash, created_at)`（限流查询）、`(status, created_at)`（后台待审队列）。

### 3.2 `post_likes`

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `post_id` | `uuid` | FK `posts.id` ON DELETE CASCADE | |
| `visitor_id` | `uuid` | NOT NULL | 访客浏览器持久 cookie 的随机 UUID（服务端生成，httpOnly，1 年） |
| `created_at` | `timestamptz` | NOT NULL, now() | |

主键 `(post_id, visitor_id)` 天然防重；点赞计数 = `count(*)`（博客量级无需反范式列）。

### 3.3 数据不变量

| # | 不变量 | 强制层级 |
| --- | --- | --- |
| 1 | `status` 仅取 `pending` / `approved` | 应用层（zod + TS 联合类型） |
| 2 | 前台只展示 `status = 'approved'` | 应用层（查询过滤） |
| 3 | `parent_id` 必须指向同文章、`approved`、且自身为顶级的评论 | 应用层（action 校验） |
| 4 | `(post_id, visitor_id)` 唯一 | DB（联合主键） |
| 5 | 不存原始 IP，仅存 HMAC 哈希 | 应用层 |
| 6 | 文章删除级联删除其评论与点赞 | DB（FK CASCADE） |
| 7 | 删除顶级评论级联删除其回复 | DB（parent_id 自引用 CASCADE） |

迁移 0003 为纯建表（additive），先执行或先部署均无顺序风险（区别于 0002 的教训）。

## 4. 写入与限流（Server Action）

落点：`src/app/(blog)/posts/[slug]/actions.ts` 追加（与 trackView / getPostContentBySlug 同文件）。

### 4.1 `addCommentAction(prev, formData)`（useActionState 签名）

1. **zod 校验**（`src/lib/validators/comment.ts`）：`postId` uuid、`authorName` 1–30（trim）、`authorUrl` 选填 http(s) ≤200、`content` 1–1000（trim）、`parentId` uuid 可空、**`website` 蜜罐字段必须为空**；
2. **蜜罐**：隐藏字段 `website` 非空（机器人填写）→ 静默返回成功文案，不写库；
3. **限流**：`ipHash = HMAC-SHA256(x-forwarded-for + user-agent, AUTH_SECRET)`；查询该 hash 在 10 分钟窗口内的评论数，≥3 → 拒绝「评论太频繁，请稍后再试」；
4. **parentId 校验**（有值时）：目标评论存在、`post_id` 一致、`status = 'approved'`、且自身 `parent_id IS NULL`（一级限制）；任一不满足 → 字段级错误；
5. 写入 `status: 'pending'`；返回成功文案「**评论已提交，博主审核通过后显示**」（先审后显，列表不变）。

IP 获取：`headers()` 的 `x-forwarded-for` 首段（Vercel/Cloudflare 提供）；UA 取 `user-agent`。哈希用 `node:crypto` 的 `createHmac` + `AUTH_SECRET`。

### 4.2 `toggleLikeAction(postId)` 

1. 读取 cookie `lk_visitor`：无则生成随机 UUID 并写入（httpOnly、sameSite lax、maxAge 1 年、path `/`）；
2. `post_likes` 有行 → 删除（取消）；无行 → 插入（点赞）；
3. 返回 `{ liked, count }` 供按钮更新；失败时按钮回滚旧状态。

## 5. 查询（`queries.ts` 追加，均不缓存）

| 查询 | 说明 |
| --- | --- |
| `listApprovedComments(postId)` | `status='approved'` 按 `created_at` 正序；应用层组装 reply 分组（`parentId` 指向顶级） |
| `getLikeState(postId, visitorId)` | `{ count, liked }` 单次查询返回 |
| `listAdminComments({ status?, page? })` | join posts 取文章标题/slug，`createdAt` 倒序分页（10/页） |
| `getAdminCommentKpis()` | `{ pending, approved }` 计数 |

详情页为 `force-dynamic`，评论列表 RSC 直查无缓存问题；点赞计数实时查询，不做反范式。

## 6. 前台（文章详情页）

### 6.1 挂载点

- `MarkdownWithToc` footer 内、`PostNavigation` **之前**新增「评论」区块（现有 footer 已是纵向堆叠容器）；
- header meta 行「N 次阅读」旁追加点赞计数（`❤ N`）；
- 新增 `LikeButton`（client）挂 footer 按钮组（CopyContentButton / SharePosterButton 同排）。

### 6.2 组件

**`src/components/blog/comments.tsx`**（`"use client"`）：接收服务端传入的 `comments: CommentItem[]`（已通过的平铺数据，含 `parentId`）与 `postId`，内部完成：
- 顶级评论 + 一级回复的缩进渲染（回复行前缀「@昵称」）；
- 每条评论的「回复」按钮 → 将 `replyTo` 置入表单（表单顶部显示「回复 @某某」可取消）；
- `CommentForm`：昵称（Input）、主页（Input，选填）、内容（Textarea）+ 隐藏蜜罐字段 `website`；`useActionState` 提交；pending 态禁用提交按钮；成功态显示「已提交，博主审核通过后显示」并清空内容字段（昵称/主页保留，便于连续评论）；
- 内容展示**纯文本转义 + `\n` → 换行**，不做 Markdown；样式跟随 blog token（border-border、text-muted-foreground、font-mono meta 行）。

**`src/components/blog/like-button.tsx`**（`"use client"`）：心形 + 计数；props `{ postId, initialCount, initialLiked }`；点击乐观切换并调 `toggleLikeAction`，返回值校准；失败回滚 + 「操作失败」短暂提示。

**服务端数据获取**：详情页 RSC 读取 `lk_visitor` cookie → `getLikeState` → 传 `initialCount`/`initialLiked`；评论列表同页直查。

## 7. 后台审核（`/admin/comments`）

- 页面：表格列 = 内容（截断 80 字，title 全文）/ 作者（昵称 + 主页链接）/ 所属文章（title，链接到编辑页）/ 提交时间 / 状态徽章（待审=amber、已通过=emerald，对齐现有徽章）；
- 筛选 Tab：待审 / 已通过 / 全部（searchParams，同标签管理）；KPI 卡：待审数、已通过数；
- 行操作：**通过**（pending → approved，服务端表单按钮）、**删除**（AlertDialog 确认，注明「其回复将一并删除」）；
- `admin/comments/actions.ts`：`approveCommentAction(id)`（isAdmin；仅 pending 可通过）、`deleteCommentAction(id)`（isAdmin）；
- 侧边栏「标签」之后加「评论」入口（`MessageSquare` 图标）。

## 8. RLS 与索引（`supabase/rls.sql` 追加）

- `alter table comments / post_likes enable row level security;`——**不建任何策略**（与 post_tags 同口径：匿名访客不直连库，写入走 Server Action 的 owner 连接，前台读也走 RSC 的 owner 连接）；
- 二级索引：`comments_post_created_idx on comments (post_id, created_at)`、`comments_ip_hash_idx on comments (ip_hash, created_at)`、`comments_status_idx on comments (status, created_at)`。

## 9. 测试与验收

### 9.1 行为链路（验证脚本可直接调查询层模拟）

1. 提交评论 → `status='pending'` → 前台不可见 → 后台通过 → 前台可见；
2. 点赞 → count=1 且 liked=true → 再点 → count=0 且 liked=false → 换 visitorId 再赞 → count=1；
3. 10 分钟内同 ipHash 第 4 条 → 拒绝；
4. 回复非一级评论 / 回复 pending 评论 / 跨文章 parentId → 均拒绝；
5. 蜜罐字段非空 → 返回成功但无新行；
6. 删除顶级评论 → 其回复级联消失。

### 9.2 工程

`pnpm typecheck` / `lint` / `test` / `build`；机检断言复用（无 `posts.tags` 残留等）；`/admin/comments` 需登录态手测。

### 9.3 手测清单（需求方）

匿名提交 → 待审 → 后台放行 → 前台可见全流程；一级回复展示；点赞/取消/刷新后状态保持；限流触发提示；暗色模式下表单与列表观感。

## 10. 实施阶段（切片推进，同标签 spec 纪律）

| # | 切片 | 验证点 | 状态 |
| --- | --- | --- | --- |
| C1 | schema.ts 两表 + `pnpm db:generate`（0003，纯建表可先执行） | 迁移文件生成、typecheck 绿 | ⬜ |
| C2 | validators/comment.ts + actions（addComment/toggleLike）+ 查询 | typecheck 绿 | ⬜ |
| C3 | 前台 comments.tsx + like-button.tsx + 详情页挂载 | build 绿 + 行为链路脚本 | ⬜ |
| C4 | rls.sql 追加（RLS + 索引） | 执行后权限自查 | ⬜ |
| C5 | 后台 /admin/comments + 侧边栏入口 | build 绿 + 手测 | ⬜ |
| C6 | 全量验证 + 主 SPEC/README 同步 | 四件套全绿 | ⬜ |

## 11. 进度表

> 实施开始后在此记录（同标签 spec §20 约定：每切片 5–20 行 + 一次可运行验证；spec 与实现分开提交；**未经需求方明确指示不 commit/push**）。

（空）
