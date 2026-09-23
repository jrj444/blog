# 标签管理体系 Spec v1.4

> 状态：Draft v1.4（依据代码核对的评审修订版，待确认）  
> 日期：2026-09-23  
> 关联文档：`specs/spec-jiangruijians-blog.md`  
> 目标：将标签从 `posts.tags text[]` 中独立出来，提供标签重命名、停用、趋势统计和防重复能力。
>
> **v1.4 修订摘要（相对 v1.3）**
>
> - 修正 §8 停用标签与文章保存的冲突：已有关联可保留，仅禁止新增关联。
> - 修正 §10 趋势 SQL 的时区换算（原写法会漏掉窗口起始月头部 8 小时的数据）。
> - 新增 §5.3 `published_at` 的数据库级不变量（CHECK 约束）。
> - 补齐实施细节：表单序列化约定（§8）、归一化与 slug 实现复用（§6、§13）、SQL 落点（§13、§14）、并发与事务（§8、§12）、缓存边界的 Date（§10、§11）、改造波及清单（§11）。
> - 修正与现状不符的描述：RSS 无标签输出（§9）、「今年」统计口径（§3、§5.3）。
> - §14 去掉与 UNIQUE 约束重复的索引；§18 补充待确认项。
> - 新增 §13.6：实测确认 `pnpm db:push` 会删除 RLS / 策略 / CHECK / `posts_tags_gin`，本项目禁用 `db:push`，只用 `generate + migrate`。
> - §5.3 CHECK 约束改为推荐写进 Drizzle schema（受迁移跟踪），并给出「回填后第二次迁移再加」的顺序。

---

## 1. 摘要

标签与文章是多对多关系，核心模型为：

```text
posts
  └── post_tags
          └── tags
```

标签成为独立实体，具备稳定 ID、名称、slug 和生命周期管理（新建、编辑、停用、删除）。

- `normalized_key` 归一化防止大小写、空白和 Unicode 变体造成的重复标签。
- 标签重命名只修改展示名称，slug 创建后不可修改，URL 永远稳定。
- 标签可停用（前台隐藏，数据保留），无关联的停用标签可硬删除。

### 1.1 核心决策

| 决策项 | 结论 |
| --- | --- |
| 标签实体 | 独立 `tags` 表 |
| 文章与标签关系 | `post_tags` 中间表，联合主键防重复 |
| 标签唯一性 | `normalized_key` 唯一 |
| URL 标识 | `slug` 唯一，创建后不可修改 |
| 标签重命名 | 只改 `name` 和 `normalized_key`，不改 slug |
| 旧 URL | 不区分大小写匹配 slug；其次匹配归一化名称并永久重定向 |
| 停用标签 | `is_active = false`，前台隐藏，数据保留；已有文章的关联保留，仅禁止新增关联 |
| 已发布文章的时间 | `published = true` 时 `published_at` 必须非空，由 CHECK 约束保证 |
| 删除标签 | 有关联时禁止硬删除，需先移除关联或停用 |
| 趋势统计 V1 | 按 `published_at` 统计每月新增已发布文章数 |
| 阅读量趋势 | V1 只提供当前累计阅读量快照 |
| 标签合并 | V1 不实现；需要合并时手动调整文章标签后删除旧标签 |

---

## 2. 目标与非目标

### 2.1 目标

- 标签成为独立实体，可新增、编辑、停用和删除。
- 支持标签描述和启用状态。
- 支持防止大小写、空白、Unicode 变体造成的重复标签。
- 支持文章编辑器搜索、选择和创建标签。
- 支持标签文章数、最近使用时间和 12 个月新增文章趋势。
- 支持从现有 `posts.tags text[]` 安全迁移和回滚。
- 停用标签不影响已有文章的保存与编辑。

### 2.2 非目标

- 标签合并（V1 通过手动调整文章标签实现，文章量大时再考虑自动化）。
- 标签层级、父子标签和分类树。
- 多作者权限与标签审核流。
- AI 自动推荐标签。
- 任意修改 slug 及完整历史重定向链。
- 精确的月度阅读量趋势。
- 标签多语言翻译。
- 独立的 SEO 标题和 SEO 描述字段。
- 标签别名表；以及「旧名称被新标签复用后」的链接指向保护（V1 接受内容漂移，见 §6.3 与 §18）。

---

## 3. 当前实现审计

| 功能 | 当前实现 |
| --- | --- |
| 存储 | `posts.tags text[]`，见 `src/lib/db/schema.ts` |
| 写入 | 文章表单接收逗号分隔文本，见 `src/app/admin/posts/actions.ts` |
| 校验 | `z.array(z.string().trim().min(1)).max(10)`，见 `src/lib/validators/post.ts` |
| 筛选 | `arrayContains(posts.tags, [tag])`，见 `src/lib/db/queries.ts` |
| 统计 | `unnest(posts.tags) + group by` |
| 前台标签页 | `/tags`、`/tags/[tag]` |
| 标签链接 | `encodeURIComponent(tag)` |
| sitemap | 使用标签名称生成 URL |
| 索引 | `posts_tags_gin`，定义于 `supabase/rls.sql` |

当前主要问题：

1. 标签没有稳定 ID，重命名会影响所有关联。
2. 标签元数据无处存放。
3. 无法从数据库层保证文章与标签关联唯一。
4. 输入没有做大小写、空白和 Unicode 归一。
5. slug 与名称耦合，改名会改变 URL。
6. 没有 `published_at`，无法按发布时间统计趋势。
7. `posts.views` 只有累计值，无法还原历史阅读趋势。
8. 统计口径不统一：`getPublishedStats` 的「今年」按 `created_at` 统计（`src/lib/db/queries.ts:501`），引入 `published_at` 后需要统一。

---

## 4. 领域模型

### 4.1 实体

- `Tag`：标签实体，保存名称、slug、元数据和生命周期状态。
- `PostTag`：文章与标签的关联实体。
- `published_at`：文章首次成功发布时间。

### 4.2 数据不变量

1. `tags.normalized_key` 全局唯一。
2. `tags.slug` 全局唯一且创建后不可修改。
3. `post_tags(post_id, tag_id)` 全局唯一。
4. 一篇文章最多关联 10 个标签。
5. `post_tags.position` 决定文章内的展示顺序。
6. 公开标签必须满足 `is_active = true`（前台可见性）。
7. 删除文章时级联删除 `post_tags`，不删除标签。
8. 有文章关联的标签不能硬删除，需先移除关联或停用。
9. `posts.published = true` 时必须 `published_at IS NOT NULL`，由数据库 CHECK 约束保证（§5.3）。
10. 停用标签（`is_active = false`）不允许被新增关联，但既有 `post_tags` 关联保留，文章保存时原样回写。

---

## 5. 数据库设计

### 5.1 `tags`

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` | 稳定标识 |
| `name` | `text` | NOT NULL | 展示名称，如 `Next.js` |
| `normalized_key` | `text` | NOT NULL, UNIQUE | 归一化唯一键，如 `next.js` |
| `slug` | `text` | NOT NULL, UNIQUE | URL 标识，创建后不可变 |
| `description` | `text` | NULL | 标签页简介 |
| `is_active` | `boolean` | NOT NULL, true | 是否允许公开访问；停用后前台隐藏，且禁止被新增关联（§7.5） |
| `created_at` | `timestamptz` | NOT NULL, now() | 创建时间 |
| `updated_at` | `timestamptz` | NOT NULL, now() | 最近修改时间 |

说明：

- `normalized_key` 负责防重复，不能用 slug 替代。
- `slug` 支持 Unicode，不强制转拼音。
- V1 不保存 `post_count`，统计实时查询或缓存，避免计数漂移。
- `name`、`slug`、`description` 一律设长度上限（建议 name ≤ 50、slug ≤ 60、description ≤ 200），validator 与服务端双重校验；当前代码对标签名没有任何长度约束，超长名称会生成超长 slug 和 URL。

### 5.2 `post_tags`

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `post_id` | `uuid` | FK `posts.id` ON DELETE CASCADE | 文章 ID |
| `tag_id` | `uuid` | FK `tags.id` ON DELETE RESTRICT | 标签 ID |
| `position` | `smallint` | NOT NULL, 0 | 文章内展示顺序 |
| `created_at` | `timestamptz` | NOT NULL, now() | 首次关联时间 |

主键：

```sql
primary key (post_id, tag_id)
```

索引：

```sql
create index post_tags_tag_id_idx on post_tags (tag_id, post_id);
```

### 5.3 `posts` 新增字段

| 字段 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `published_at` | `timestamptz` | NULL | 首次成功发布时间 |

发布规则：

- 草稿首次发布：写入 `now()`。
- 已发布文章编辑：保持不变。
- 已发布文章撤稿：保留原值，同时 `published = false`。
- 撤稿后再次发布：保留已有值；为空时写入 `now()`。
- 趋势统计只包含 `published = true AND published_at IS NOT NULL` 的文章。

数据库级不变量（两种落法，推荐 A）：

**A. 写进 Drizzle schema（推荐，受迁移管理）**

```ts
// src/lib/db/schema.ts —— 在回填之后的第二次迁移里加，不要和建表同一个迁移
import { check } from "drizzle-orm/pg-core";

export const posts = pgTable(
  "posts",
  { /* ... */ },
  (table) => [
    // ...现有索引
    check("posts_published_at_required", sql`not ${table.published} or ${table.publishedAt} is not null`),
  ],
);
```

顺序要求（重要）：

1. 第一个迁移：建 `tags` / `post_tags` + 加 `published_at`（此时**不写**这条 check）。
2. 执行回填脚本。
3. 改 `schema.ts` 加上 `check(...)`，再 `pnpm db:generate` 生成第二个迁移，用 `pnpm db:migrate` 应用。

好处：约束进入 Drizzle 的跟踪范围，`db:generate` 不会想删它，`db:push` 也不会想删它。

**B. 手写进 `supabase/rls.sql`（次选）**

```sql
-- 在回填完成、历史数据全部满足后再添加；回填前添加会导致迁移失败
alter table posts
  add constraint posts_published_at_required
  check (not published or published_at is not null);
```

代价：Drizzle 不认识它，**`pnpm db:push` 会想把它删掉**（实测行为见 §13.6）。若选 B，必须同时禁用 `db:push`。

说明：

- 对应 §4.2 不变量 9。目的是让「已发布但漏写发布时间」在写入时立刻报错，而不是让趋势统计静默少算（§13.5 的验收项依赖它）。
- 无论哪种落法，添加时机都必须在回填之后：实测在回填前添加，Postgres 会因存量违例行直接报 `check constraint ... is violated by some row`（错误码 23514）。
- 统计口径统一：`getPublishedStats` 的「今年」当前按 `created_at` 统计（`src/lib/db/queries.ts:501`），引入 `published_at` 后一并改按 `published_at`，否则两处口径不一致。

### 5.4 旧字段

`posts.tags` 在迁移期保留，用于兼容旧代码和回滚。最终确认后再删除该列和 `posts_tags_gin`。

---

## 6. 名称、slug 与 URL

### 6.1 名称归一化

`normalizeTagName`：

1. 执行 Unicode `NFKC`。
2. 去除首尾空白。
3. 将连续空白折叠为一个空格。
4. 保留显示大小写和标点。

`normalizeTagKey`：

1. 在归一化名称基础上转为小写。
2. 使用 `en-US` locale。
3. 写入 `tags.normalized_key`。

示例：

| 输入 | name | normalized_key |
| --- | --- | --- |
| ` React ` | `React` | `react` |
| `REACT` | `REACT` | `react` |
| `Next.js` | `Next.js` | `next.js` |
| `前端` | `前端` | `前端` |

`React` 和 `REACT` 被视为同一标签。创建时自动解析到已有标签，不新增第二行。

实现要求：

- `normalizeTagName` / `normalizeTagKey` 放在 `src/lib/tags/normalize.ts`；运行时写入与迁移回填脚本（§13.2）**必须 import 同一份实现**，不允许在脚本或 SQL 里另写一套，否则迁移结果与后续新建标签的行为会漂移。
- 单测覆盖：`React` / `REACT` / `  React  ` / 中文 / 全角与半角变体。

### 6.2 slug 生成

创建标签时：

1. 对名称执行 NFKC 和 trim。
2. 英文字母转小写。
3. 空白转 `-`。
4. 保留 Unicode 字母、数字、`-`、`_`、`.`。
5. 合并连续 `-`，去除首尾 `-`。
6. 空结果使用 `tag-<8 位随机串>`。
7. 冲突时追加 `-2`、`-3`。

示例：

| name | slug |
| --- | --- |
| `Next.js` | `next.js` |
| `React Server Components` | `react-server-components` |
| `前端` | `前端` |
| `C++` | `c`，创建时可手工指定为 `cpp` |

规则：

- slug 仅允许在创建时手工指定。
- 创建后不可编辑。
- slug 修改不纳入 V1，因此不需要别名表。
- 标签改名不修改 slug，现有 URL 永远保持稳定。

实现要求：

- slug 生成放在 `src/lib/tags/slug.ts`，同样被回填脚本复用。
- 冲突递增（`-2`、`-3`）、空结果随机串兜底、手工指定冲突报错、长度上限（建议 ≤ 60）都在同一处实现并单测。

### 6.3 URL 解析

`/tags/[slug]` 按以下顺序解析：

1. 不区分大小写匹配 `tags.slug`（slug 全小写存储，但用户可能访问大小写混合的旧 URL）。
   实现：对入参 `toLowerCase()` 后 `eq(tags.slug, value)`；**不要写 `lower(tags.slug) = ...`**，那会绕开唯一索引。
2. 未命中时，将 URL 参数按标签名称归一化，匹配 `normalized_key`。
3. 最终地址与当前 URL 不同时执行永久重定向（`permanentRedirect()`）。
4. 目标标签停用或不存在时返回 404。

这样可以兼容迁移前的 `/tags/React`、`/tags/REACT` 和 `/tags/React%20Server%20Components` 等旧地址，而不需要别名表。

限制与注意事项：

- 回退解析只做一次，不追历史链：旧的「名称型 URL」只有在名称仍等于该标签当前 `name` 时命中；标签改名后该地址失效并返回 404（slug 未变，所以规范地址依然稳定）。
- 若某标签改名后，旧名称被另一个标签占用，那么旧的外部链接会指向新标签（内容漂移）。V1 接受该成本，不做检测（见 §18）。
- 重定向的真实状态码需实测：`permanentRedirect()` 在流式渲染下只插入 meta 标签做客户端跳转，不保证返回 308。验收标准见 §15.2。
- 解析需要查库，而 `src/proxy.ts` 没有 postgres 客户端，因此这一步只能在页面内完成，不能放进 middleware。

---

## 7. 后台标签管理

### 7.1 页面

| 路由 | 用途 |
| --- | --- |
| `/admin/tags` | 列表、搜索、筛选和统计摘要 |
| `/admin/tags/new` | 新建标签 |
| `/admin/tags/[id]` | 编辑、统计和生命周期操作 |

侧边栏在"文章"和"媒体库"之间增加"标签"入口。

### 7.2 标签列表

必须支持：

- KPI：总标签数和未使用标签数。
- 搜索名称、slug 和描述。
- 按文章数、创建时间、更新时间排序。
- 状态筛选：全部、启用、停用、未使用。
- 展示名称、slug、已发布文章数、总关联数、状态和最近使用时间。
- 操作：新建、编辑、停用/启用、删除。

### 7.3 新建标签

字段：

- 名称，必填。
- slug，可空；为空时自动生成。
- 描述，可空。
- 启用状态。

行为：

- normalized key 冲突时返回错误，并链接到已有标签。
- 自动 slug 冲突时追加编号；手工 slug 冲突时直接报错。
- 手工 slug 同样要归一化（转小写、去除不允许字符、折叠连续 `-`）并通过格式与长度校验（≤ 60），不接受客户端原样写入。
- 创建成功后跳转详情页。

### 7.4 编辑与重命名

可编辑：

- `name`
- `description`
- `is_active`

不可编辑：

- `id`
- `slug`
- `created_at`

重命名规则：

1. 计算新 `normalized_key`。
2. 若与其他标签冲突，禁止保存并提示已有同名标签。
3. 更新 `name` 和 `normalized_key`。
4. 保持 slug 不变。

### 7.5 停用与删除

停用：

- 设置 `is_active = false`。
- 前台标签云、标签页、sitemap 和文章徽章中隐藏，文章 keywords（JSON-LD）也不输出停用标签。
- `post_tags` 和统计数据保留。
- 管理后台可恢复启用。
- **已有文章不受影响**：编辑旧文章时，停用标签以「已停用」标记回显，提交时原样保留关联，不视为新增（见 §8 处理规则 2）。
- **不允许被新增关联**：新建文章或编辑其他文章时，停用标签不出现在可选项中。

删除：

- 只有无任何文章关联的标签可以硬删除。
- 有文章关联时，必须先移除所有关联或停用。
- V1 不提供强制删除所有关联的一键操作。

---

## 8. 文章标签编辑

文章表单从逗号文本升级为标签选择组件，支持：

- 搜索已有启用标签。
- 下拉选择，显示名称。
- 输入新名称并按回车加入待关联列表，提交文章时由服务端创建或解析。
- 键盘上下选择、回车确认、退格删除。
- 最多 10 个标签。
- 按 normalized key 自动去重。
- 顺序写入 `post_tags.position`。

服务端输入模型：

```ts
type PostTagInput = {
  id?: string;
  name?: string;
};
```

处理规则：

1. 按 normalized key 去重，保持出现顺序。计算 key 时需先解析条目：带 `id` 的查该标签的 `normalized_key`，带 `name` 的走 §6.1 归一化；**不要直接对原始字符串去重**，否则 `React` 与 `REACT` 会同时留下。
2. 有 `id` 时验证标签存在：
   - 标签启用（`is_active = true`）：正常关联。
   - 标签停用（`is_active = false`）：**仅当该文章原本就有此关联时才允许保留**，否则拒绝。这样停用标签既不会导致旧文章无法保存，也不会被新增选用。
3. 无 `id` 时按 normalized key 匹配已有标签（**包含停用标签**，命中后按规则 2 处理）；未命中时创建新标签，新标签默认 `is_active = true`。
4. 在同一事务中写文章和 `post_tags`。
5. 保留最多 10 个标签的校验。
6. 仅管理员可以创建或关联标签。
7. 并发安全：并行提交同一新标签名会撞 `normalized_key` 唯一索引，创建时用 `insert ... on conflict (normalized_key) do nothing` 后重查该行，或捕获唯一键冲突（23505）后重查。不要直接把唯一键冲突抛给用户。

表单与序列化约定（客户端 → 服务端）：

- 标签选择组件把选中项写入隐藏字段 `tags`，格式为 **JSON 数组字符串**，元素形如 `{ "id": "..." }` 或 `{ "name": "..." }`；提交前校验条目数 ≤ 10。
- 服务端 zod 校验（`src/lib/validators/post.ts`）：

```ts
tags: z
  .array(
    z.union([
      z.object({ id: z.uuid() }),
      z.object({ name: z.string().trim().min(1).max(50) }),
    ]),
  )
  .max(10, "标签最多 10 个"),
```

- `PostTagInput` 同时约束「`id` 与 `name` 至少有一个」，`name` 走 §6.1 的归一化后再用。
- `PostInput.tags` 由 `string[]` 改为 `PostTagInput[]`；`parseForm`（`src/app/admin/posts/actions.ts`）改为解析该隐藏字段，不再 `split(",")`；若解析失败要给出字段级错误而不是静默丢弃标签。
- 事务内不要套 `queryWithRetry`：它只针对只读查询，写操作重试可能重复建标签（见 `src/lib/db/index.ts` 的注释）。

过渡期兼容：

- 新代码仍把最终标签名称按 `position` 写回 `posts.tags`。
- 最终清理迁移时移除双写逻辑。

---

## 9. 前台展示

`/tags`：

- 只展示公开标签（`is_active = true`）。
- 排序：已发布文章数倒序、名称。
- 显示名称、文章数和可选描述。

`/tags/[slug]`：

- 使用第 6.3 节解析规则。
- 停用或不存在时返回 404。
- metadata 优先使用标签名称和描述。
- 启用但没有已发布文章时显示空状态，不进入 sitemap。

标签徽章：

- 链接使用 slug，显示使用名称。
- 文章 keywords（JSON-LD）使用标签名称，且**只包含启用标签**（停用标签不输出）。
- 停用标签不出现在文章详情页的徽章列表中（与 §7.5 的隐藏规则一致）；后台编辑页仍显示并标注「已停用」。

sitemap：

- 只输出公开（`is_active = true`）且至少关联一篇已发布文章的标签。
- URL 用 slug，不再用标签名称。

RSS：

- 现状：`src/app/feed.xml/route.ts` **当前没有任何标签输出**（无 `<category>`），所以这里是"保持现状"而不是"继续输出名称"。
- V1 决定：RSS 不新增 `<category>`，语义不变。若要新增，需作为独立变更单列，因为它会影响 feed 消费方的行为。

---

## 10. 趋势与统计

V1 指标：

| 指标 | 定义 | 数据来源 |
| --- | --- | --- |
| 已发布文章数 | 当前关联的已发布文章数 | `post_tags + posts` |
| 草稿关联数 | 当前关联但未发布的文章数 | `post_tags + posts` |
| 累计阅读量快照 | 当前关联已发布文章的 `views` 总和 | `sum(posts.views)` |
| 月新增文章趋势 | 每月首次发布时间对应的文章数 | `published_at` 经 `Asia/Shanghai` 换算后按月分组 |
| 最近使用时间 | 最大 `published_at` | `max(posts.published_at)` |

趋势查询：

```sql
select
  to_char(date_trunc('month', p.published_at at time zone 'Asia/Shanghai'), 'YYYY-MM') as month,
  count(*)::int as count
from post_tags pt
join posts p on p.id = pt.post_id
where pt.tag_id = $1
  and p.published = true
  and p.published_at >= (
    (date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '11 months')
    at time zone 'Asia/Shanghai'
  )
group by 1
order by 1;
```

时区说明（容易写错，必须按上面写）：

- 窗口起点写成 `date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '11 months'` 会得到 `timestamp`（无时区），与 `timestamptz` 比较时 Postgres 按**会话时区**隐式转换。Supabase 默认 UTC，等于窗口起点整体偏了 8 小时，每月头 8 小时发布的文章会被静默漏掉。
- 必须把算出来的 `timestamp` 再 `at time zone 'Asia/Shanghai'` 转回 `timestamptz`，两边的时区语义才一致。
- 分组键先用 `to_char(..., 'YYYY-MM')` 或 `date_trunc` 返回 `timestamp`；`date_trunc('month', timestamptz)` 依赖会话时区，不要直接用它做分组键。

UI 必须补齐缺失月份为 0，展示连续 12 个自然月。

缓存边界的类型处理：

- 趋势与「最近使用时间」如果经过 `unstable_cache`，`Date` 会被序列化成字符串（仓库已踩过此坑，见 `src/lib/db/queries.ts:493-494` 与 `src/lib/format-date.ts` 中 `toDate` 的注释）。
- 约定：跨缓存边界只返回原始类型——月份返回 `"YYYY-MM"` 字符串、时间返回 ISO 字符串，调用方用 `toDate()` 还原，不要依赖 Date 实例。

「最近使用时间」定义：

- 取该标签关联文章中**已发布**文章的 `max(published_at)`；没有任何已发布文章时为 `null`，UI 显示"—"。
- 后台列表排序若提供"最近使用"维度，按同一口径（`null` 排最后）。

限制：

- `posts.views` 是累计值，不能还原历史阅读量。
- V1 的累计阅读量必须明确标记为"当前快照"。
- 精确趋势后续使用 `post_view_daily` 或 `post_view_events`，不在本阶段实现。

---

## 11. 数据访问接口

建议新增：

```ts
listAdminTags(params): Promise<AdminTagListItem[]>
getAdminTagById(id): Promise<AdminTagDetail | null>
listTagUsageStats(tagId): Promise<TagUsageStats>
listTagMonthlyTrend(tagId, months): Promise<TagTrendPoint[]>
listPublicTagsWithCounts(): Promise<TagSummaryWithCount[]>
resolvePublicTag(routeValue): Promise<ResolvedTag | null>
listPostTags(postIds): Promise<Map<string, TagSummary[]>>
```

统一类型：

```ts
type TagSummary = {
  id: string;
  name: string;
  slug: string;
};

type ResolvedTag = TagSummary & {
  description: string | null;
  isActive: boolean;
};
```

前台 `PostListItem.tags` 从 `string[]` 改为 `TagSummary[]`，组件不得继续使用标签名称拼接 URL。

### 11.1 改造波及清单（必须逐个处理）

`PostListItem.tags` 的类型变更会波及下列位置，P1 的完成标准包含全部处理完毕：

| 位置 | 现状 | 需要做什么 |
| --- | --- | --- |
| `src/lib/db/queries.ts:46` | `PostListRow.tags: string[]` | 改为 `TagSummary[]`，列表查询 join `post_tags` + `tags` |
| `src/lib/db/queries.ts:31` | `listColumns` 投影 `tags: posts.tags` | 改为聚合子查询或二次查询 |
| `src/lib/db/queries.ts:351` | `arrayContains(posts.tags, [tag])` | 改为按 tag_id join 过滤 |
| `src/lib/db/queries.ts:528-567` | `queryAllTags` / `queryTagsWithCounts`（`unnest`） | 改为查 `tags` + `post_tags`，过滤 `is_active`，只计已发布文章 |
| `src/app/(blog)/tags/[tag]/page.tsx:33,36` | 原样使用路由参数、`encodeURIComponent` | 改为 §6.3 解析 + slug 链接 |
| `src/app/(blog)/tags/page.tsx:38` | 名称拼 URL | 改为 slug |
| `src/app/sitemap.ts:25-29` | 名称拼 URL | 改为 slug |
| `src/components/blog/tag-badge.tsx:11-28` | `encodeURIComponent(tag)` | 接收 `TagSummary`，用 `tag.slug` |
| `src/components/blog/home-feed.tsx:17` | 从当前页文章 tags 拼 chips | 标签来源改为独立查询（否则首页没有标签数据） |
| `src/components/blog/search-dialog.tsx:267-277` | 纯文本 `#tag` | 视需要改为链接（保持文本也可，但不要用名称拼 URL） |
| `src/app/(blog)/search-action.ts:11,33` | `SearchResultItem.tags: string[]` | 改类型 |
| `src/app/(blog)/posts/[slug]/page.tsx:88,118-121,154` | `keywords: post.tags.join(", ")`、TagBadge、分享海报 | 名称取 `tag.name`，链接取 `tag.slug`，keywords 过滤停用标签 |
| `src/app/(blog)/posts/[slug]/opengraph-image.tsx:21,151-166` | `#{tag}` | 改用 `tag.name` |
| `src/components/blog/share-poster-modal.tsx:11,176-193` | `post.tags.slice(0,4)` | 改用 `tag.name` |
| `src/app/admin/posts/page.tsx:188-195` | 前 3 个标签纯文本 | 改用 `tag.name`（可标注停用） |
| `src/app/admin/page.tsx:233-247` | 仪表盘「标签分布」用名称拼 `/tags/...` | 改用 slug，并过滤停用标签 |
| `src/app/admin/posts/[id]/page.tsx:30` | `tags: post.tags` 传给表单 | 改为 `PostTagInput[]` |

注意：`getPublishedStats`（`queries.ts:496-516`）改用 `published_at` 后同样要处理缓存边界（现返回 ISO 字符串，保持一致即可）。

---

## 12. 缓存、权限与安全

写操作统一失效：

```ts
revalidateTag(POSTS_CACHE_TAG, "max");
revalidatePath("/", "layout");
revalidatePath("/admin/tags");   // 后台标签各页按需补充，见下
```

原则：

- 前台标签云、标签页、文章标签投影挂 `POSTS_CACHE_TAG`。
- 缓存实现沿用现有 `unstable_cache`（本项目未开启 cacheComponents，不能用 `use cache`），复用 `src/lib/db/queries.ts:94-107` 的 `cached()` 包装；新查询照此模式接入 `POSTS_CACHE_TAG`，不要另建缓存 tag。
- 后台列表、统计和趋势不缓存（管理员需要看到刚改完的数据）。
- 创建、更新、停用、删除后立即失效缓存；**停用标签必须走同一失效逻辑**，否则标签云和文章徽章会继续显示已停用标签。
- 标签相关 Server Actions 除 `revalidatePath("/admin/tags")` 外，编辑/详情页的 `revalidatePath("/admin/tags/[id]", "page")` 需一并处理，不能只失效列表。
- 所有 Server Actions 必须调用 `isAdmin()`，不能只依赖 layout 鉴权（仓库现有惯例：`src/app/admin/posts/actions.ts:58,75,88` 逐个校验）。
- id、name、slug 和描述全部在服务端校验，长度上限见 §5.1。
- 不允许客户端修改 `normalized_key` 和时间字段。
- 创建和更新必须使用事务：`db.transaction(...)` 包裹「解析/创建标签 + 写 `post_tags` + 写 `posts`」。这是本仓库首次引入事务（当前代码零事务），注意事务内不要套 `queryWithRetry`。
- RLS 落点：`tags`、`post_tags` 的 RLS 与策略写在 `supabase/rls.sql`（与现有分工一致：表结构走 Drizzle 迁移，RLS/索引/RPC 走 SQL 脚本，见 `specs/spec-jiangruijian-blog.md` 第 5.2 节的职责说明）。
- `tags` 和 `post_tags` 启用 RLS，不开放匿名直接写策略。
- `post_tags` 不开放匿名直读，避免暴露草稿关联；注意 RLS 不作用于表 owner（Drizzle 直连用户），所以真正的防线仍是应用层 `isAdmin()`。

---

## 13. 数据库迁移

采用"扩展、回填、切读、兼容双写、清理"流程。

方案落点（本项目分工，必须遵守）：

- 建表、加列、加约束 → 改 `src/lib/db/schema.ts`，用 `pnpm db:generate` 生成迁移、`pnpm db:migrate` 执行。
- 索引、RLS、策略 → `supabase/rls.sql`（该脚本在表结构迁移之后执行）。
- 回填脚本 → 独立 TS 脚本（建议 `scripts/backfill-tags.ts`），**必须复用** `src/lib/tags/normalize.ts` 与 `src/lib/tags/slug.ts`，不允许在 SQL 或脚本里另写一套归一化逻辑。
- 回填脚本要求幂等（可重复执行）：已存在的 `tags` 按 `normalized_key` 复用，已存在的 `post_tags` 用 `on conflict do nothing` 跳过。

回填脚本的运行方式（实施时要落定，本机 Node 为 v24.19.0）：

- Node 24 支持类型剥离，可直接 `node scripts/backfill-tags.ts`；但类型剥离**不解析 tsconfig 的 `@/*` 别名**，脚本内必须用相对路径且带 `.ts` 扩展名（如 `import { normalizeTagKey } from "../src/lib/tags/normalize.ts"`）。若嫌麻烦，改用 `tsx`/`ts-node` 作为 devDependency。
- 推论：`src/lib/tags/normalize.ts` 和 `src/lib/tags/slug.ts` 必须是**纯函数模块**，不得 import `next/cache`、`@/lib/db` 或任何 Next 运行时依赖，否则脚本在 Node 下无法加载（`src/lib/db/queries.ts` 就 import 了 `next/cache`，不可被脚本复用）。
- tsconfig 的 `include` 是 `**/*.ts`，脚本会被 `pnpm typecheck` 覆盖，需保持类型正确。
- 脚本需自行加载环境变量（照 `drizzle.config.ts` 的写法 `process.loadEnvFile(".env.local")`），并走直连 `DATABASE_URL`（5432）而非运行时连接池，避免池化层对长事务/批量写入的干扰。

### 13.1 扩展

1. 创建 `tags` 和 `post_tags`。
2. 为 `posts` 增加 `published_at`（此时**不加** CHECK 约束，历史数据还不满足）。
3. 保留 `posts.tags` 和 `posts_tags_gin`。
4. 添加索引（§14）与 RLS。
5. 此时旧代码仍可运行。

### 13.2 回填

1. 扫描全部 `posts.tags`。
2. 对标签执行名称归一和 key 计算。
3. 按 normalized key 合并变体。
4. 选择规范名称并生成 slug。
5. 创建 `tags`。
6. 按数组顺序写入 `post_tags.position`。
7. 同一文章内的重复 key 只保留第一次出现。
8. 已发布文章的 `published_at` 以 `created_at` 回填（通常文章创建与首次发布在同一时间窗，比 `updated_at` 更接近真实发布时间）。
9. 草稿保持 `published_at = NULL`。
10. 回填完成后**再加** `posts_published_at_required` CHECK 约束（§5.3）；添加前先跑一次校验查询确认无违例行：

```sql
select count(*) from posts where published = true and published_at is null;  -- 必须为 0
```

规范名称选择：

- 优先出现次数最多的写法。
- 次数相同选择较短的名称。
- 再相同使用稳定字典序。

旧 URL 兼容依赖 normalized key 回退解析，不创建别名表。

### 13.3 切读与双写

1. 前台、后台和文章写入切换到关系表。
2. 文章写入仍同步更新 `posts.tags`（双写）。
3. 验证一段时间后再清理。
4. 双写细则：
   - 数组内容取最终标签的**名称**，按 `position` 顺序写入。
   - 双写必须与关系表写入在同一事务内，避免两者不一致。
   - 双写是"可回滚用的影子数据"，不是事实来源；读路径一律以关系表为准。
5. 注意：一旦在后台执行过标签重命名，`posts.tags` 数组将不再与关系表保持一致，不再支持回滚到旧数组模式。应尽快推进至清理阶段。

### 13.4 清理

1. 确认关系数据完整。
2. 确认无回滚需求。
3. 修改 `src/lib/db/schema.ts` 删除 `tags` 列，用 `pnpm db:generate` 生成迁移并执行（**不要手写 SQL 改表**，否则 schema 与数据库会长期漂移，`db:generate` 会一直报差异）。
4. `posts_tags_gin` 无需单独 drop：Postgres 在删除 `tags` 列时会自动删除依赖该列的索引。但必须**手动删除 `supabase/rls.sql:29` 的 `create index if not exists posts_tags_gin` 这一行**，否则下次执行该脚本（它只 `create ... if not exists`，不会因列不存在而失败判断）会尝试重建索引并报错。
5. 删除双写代码。
6. 更新主 SPEC、README 和 RLS 文档。

### 13.5 迁移验收

- 每个旧标签映射到唯一 normalized key。
- 去重后的关联数一致。
- 每篇文章的标签集合一致（忽略顺序）。
- 无重复 `(post_id, tag_id)`。
- 已发布文章 `published_at` 均不为空（并由 CHECK 约束保证后续不变）。
- 迁移前后行数核对：`posts` 数量不变；`tags` 的 distinct `normalized_key` 数 = 去重后的旧标签数；`post_tags` 行数 = 去重后的关联数。
- 回填脚本连跑两次结果一致（幂等）。
- 旧大小写和空格 URL 可解析到 canonical slug。
- `posts_tags_gin` 在清理前保持可用，旧代码读取不受影响。

### 13.6 ⚠️ 禁止使用 `pnpm db:push`（实测结论）

**结论：本项目的 schema 变更只能用 `db:generate` + `db:migrate`，绝对不要用 `db:push`。**

原因：`drizzle-kit push` 会 introspect 真实数据库，把「数据库里有、但 `schema.ts` 里没有」的对象一律视为多余并删除。本项目大量对象由 `supabase/rls.sql`、手工 SQL、以及 Drizzle 之外的方式创建，全部落在它的清理范围内。

实测（drizzle-kit 0.31.10，独立 Postgres 实例）——对一份已按 `rls.sql` 建好对象的库执行 `push`，它准备执行：

```sql
ALTER TABLE "posts" DISABLE ROW LEVEL SECURITY;          -- 关掉 RLS
ALTER TABLE "posts" DROP CONSTRAINT "posts_published_at_required";  -- 删掉 CHECK
DROP INDEX "posts_tags_gin";                              -- 删掉标签 gin 索引
DROP POLICY "posts_public_read" ON "posts" CASCADE;       -- 删掉公开只读策略
```

并且这些语句**实际执行成功**（实测后 RLS 变为关闭、策略与索引消失）。也就是说，一次 `pnpm db:push` 就能静默关掉全站 RLS 防护、删掉标签检索索引。`push` 只在「删除有数据的列」这类场景才弹确认；上面这些 DDL 不触发数据丢失警告，非交互环境（CI、脚本）下无 TTY 时会直接失败并留下半执行状态，交互环境下按默认确认也可能放过。

安全用法对照：

| 命令 | 是否 introspect 真库 | 对 rls.sql 对象的影响 | 本项目是否可用 |
| --- | --- | --- | --- |
| `db:generate` | 否（只比对 schema 与历史快照） | 完全看不见，不会删 | ✅ 唯一推荐 |
| `db:migrate` | 否（只按顺序执行迁移文件） | 完全看不见，不会删 | ✅ 推荐 |
| `db:push` | 是 | **会删** | ❌ 禁用 |

其他实测要点：

- `generate` 与 `push` 在遇到「疑似列重命名」时都会拒绝猜测（需要 TTY 交互确认）；非交互环境会报 `Interactive prompts require a TTY terminal` 并中止，不会静默执行破坏性变更。这是好事，但意味着**重命名类变更必须人工写迁移**，不能指望自动推断。
- 加列、加表、加索引这类纯增量变更，`push` 不需要确认即可完成，数据保留 —— 但即便如此也不要养成习惯，因为增量与破坏性变更只差一次 schema 编辑。
- 若确实需要临时用 `push` 做实验，先 `pg_dump` 备份，且事后必须重跑 `supabase/rls.sql` 恢复 RLS、策略与索引。
- 建议在 `package.json` 里把 `db:push` 改名或删除，避免误用（例如改成 `db:push:unsafe`），并在 README 注明原因。

---

## 14. 索引与性能

```sql
-- UNIQUE 约束已自带唯一索引：tags_normalized_key_uidx、tags_slug_uidx（由 Drizzle schema 定义）
create index tags_active_idx on tags (is_active);
create index post_tags_tag_id_idx on post_tags (tag_id, post_id);
create index posts_published_at_idx on posts (published, published_at);
```

说明：

- 不在 SQL 里重复创建 `unique` 索引：`normalized_key` / `slug` 的唯一性由 Drizzle schema 的 `.unique()` 表达，`db:generate` 会生成对应的唯一索引/约束；两处都建会出现同名重复对象。
- `is_active` 单列索引的收益有限（表小、且查询多带其他条件），可留作后续按 `EXPLAIN ANALYZE` 结果再决定是否删除；若保留，与 `slug`/`normalized_key` 上的唯一索引一起满足当前查询。
- `post_tags` 主键覆盖按文章查询标签。
- `post_tags_tag_id_idx` 覆盖标签页和计数。
- 标签量不大时不为统计预建物化视图；出现慢查询后再优化。
- 索引落点：`supabase/rls.sql`（与现有 `posts_tags_gin`、trgm 索引一致）。
- 与 P5 的交互：`posts_tags_gin` 随 `tags` 列一起被删除（§13.4），不要在这里为它写显式 drop。

---

## 15. 测试与验收

### 15.1 数据层

- `React` 和 `react` 解析为同一标签。
- `React` / `REACT` / `  React  ` / 全角变体归一为同一 `normalized_key`。
- 一篇文章提交重复标签，只保留一个关联。
- 删除文章不删除标签。
- 有文章关联的标签不能删除。
- 停用标签前台不可见，后台可恢复。
- 停用标签的既有文章仍可保存（关联被保留、URL 不变），且不会因此被拒绝。
- 停用标签不能被新文章选用。
- 并发用同一个新名称创建标签（两次并行提交）不报错，只产生一行 `tags`。
- 已发布但 `published_at` 为空时写入被数据库拒绝（CHECK 生效）。

### 15.2 前台

- `/tags` 只显示公开标签。
- `/tags/[slug]` 正确显示名称、描述和文章。
- 旧大小写、空格 URL 永久重定向到 canonical URL：以 `curl -I /tags/React` 断言 308 + 正确 `Location`；若实测拿不到真 308（`permanentRedirect` 在流式渲染下只插入 meta），则退化为「页面可见即跳转到 canonical」，并在 metadata 中输出 canonical，同时把结论记入本文档。
- 标签改名后：新名称 URL 404、原 slug URL 正常、旧名称 URL 404（符合 §6.3 限制）。
- 停用标签返回 404，不进入 sitemap，也不出现在文章徽章与 JSON-LD keywords 中。
- 文章卡片、详情、搜索、OG 图和分享海报显示正确标签。
- 首页标签 chips（`home-feed.tsx`）来源正确（不再只依赖当前页文章）。
- 所有标签链接使用 slug。

### 15.3 后台

- 非管理员无法调用任何标签 Server Action。
- 新建、编辑、重命名、停用、启用、删除符合规则。
- 重命名不改变 URL。
- normalized key 冲突时提示已有同名标签。
- 趋势图包含连续 12 个自然月（中国时区），草稿不计入。
- 趋势边界用例：每月 1 日 00:00–08:00（Asia/Shanghai）发布的文章被计入当月，不遗漏。
- 累计阅读量标注为快照。
- 标签改名后 `posts.tags` 双写数组停止跟随（§13.3 已声明），后台有提示。

### 15.4 工程

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- 主要查询执行 `EXPLAIN ANALYZE`（标签页、计数、趋势）
- 迁移前后核对 `posts`、`tags`、`post_tags` 数量
- 新增单测：归一化、slug 生成与冲突、去重（仓库目前无测试框架，若引入需在本节补充选型）

---

## 16. 实施阶段

| 阶段 | 内容 | 完成标准 |
| --- | --- | --- |
| P0 | 表结构、迁移、回填、兼容双写 | 数据完整，旧代码可运行，CHECK 约束已加 |
| P1 | 数据访问层、前台标签页和组件改造 | 前台无回归，旧 URL 可解析，§11.1 清单全部处理完 |
| P2 | 后台 CRUD、重命名、停用 | 标签可完整管理，停用不影响旧文章保存 |
| P3 | 文章编辑器标签选择 | 新文章不再产生标签变体 |
| P4 | 统计与 12 个月趋势 | 趋势和阅读量快照可查看，时区边界用例通过 |
| P5 | 删除旧数组和文档同步 | 主 SPEC / README 更新完成，schema 无漂移 |

P0、P1 完成后才能切换生产；P5 最后执行。

**全程禁止 `pnpm db:push`**（原因见 §13.6）：只走 `pnpm db:generate` + `pnpm db:migrate`。P0 建表、加列、加约束都用这两条命令完成。

P0 与 P1 之间存在时间窗：此期间旧代码仍在写 `posts.tags`，回填后的关系数据可能落后。切读（P1）前需重跑一次回填脚本（幂等，见 §13 方案落点与 §13.5）补齐增量。

---

## 17. 回滚策略

- 删除 `posts.tags` 前，旧代码可以继续读取旧数组。
- 新代码过渡期双写 `posts.tags`，支持代码回滚（前提是尚未在后台执行过标签重命名，见 §13.3）。
- `tags` 和 `post_tags` 为新增结构，回滚应用代码时无需删除。
- 数据异常时停止切读，修复回填后重新执行（回填幂等，可安全重跑）。
- 执行 P5 前必须备份；删除旧列后只能依赖备份或关系表重建数组。
- CHECK 约束回滚需要显式 drop，不要在紧急回滚时忘记这一条：它会让「已发布但无发布时间」的写入直接失败。

### 17.1 可选简化路径

若想省掉双写与回滚复杂度，可把 P0–P3 合并为一次低峰硬切：跳过 §8 的 `posts.tags` 双写与 §13.3 的兼容阶段，回滚完全依赖数据库备份。代价是失去"代码可随时回退到数组模式"的能力，收益是消除 §13.3 那条"改名后数组不再一致"的隐患。两种方案都可行，但不要在实施中途改换。

---

## 18. 待评审确认点

1. V1 slug 创建后完全不可修改。
2. V1 不保存"重命名前的旧名称"作为可输入别名。
3. V1 不实现标签合并，需要时手动调整文章标签。
4. 有文章关联的标签禁止硬删除，只允许停用。
5. 趋势指每月新增已发布文章数，不是月度阅读量趋势。
6. 阅读量只展示当前累计快照。
7. 元数据范围：名称、slug、描述、启用。
8. 文章最多关联 10 个标签。
9. 停用标签：允许保留既有文章的关联，禁止新增关联（§7.5 / §8）。
10. 旧名称被其他标签复用后，旧链接指向新标签（内容漂移）；V1 不做检测（§6.3）。
11. `published_at` 采用 CHECK 约束落库（§5.3），而非仅靠应用层保证。
12. 双写阶段是否保留（§17.1 简化路径 vs 双写回滚能力）。
13. 是否引入测试框架以承载 §6 的归一化/slug 单测（当前仓库无测试依赖）。
14. `getPublishedStats` 的「今年」口径改为 `published_at`（§5.3），会改变现有统计数字。
15. CHECK 约束落法选 A（写进 Drizzle schema，推荐）还是 B（手写进 rls.sql，需配合禁用 `db:push`）——见 §5.3。
16. 是否把 `package.json` 的 `db:push` 重命名/移除以防误用（§13.6 实测其破坏性）。

---

## 19. 与主 SPEC 同步

功能实现后更新：

- `specs/spec-jiangruijians-blog.md` 的数据库设计（表从 `posts + settings` 变为 `posts + settings + tags + post_tags`，`posts` 增加 `published_at`）。
- 目录结构中的 `/admin/tags`、`src/lib/tags/*`、`scripts/backfill-tags.ts` 和相关文件。
- S7 标签能力说明。
- `README.md` 的标签与后台功能说明。
- 迁移、RLS 和索引记录（含 `posts_tags_gin` 的移除与 `published_at` CHECK 约束）。

本 SPEC 评审通过前，不修改主 SPEC 和业务代码。
