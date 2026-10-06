# 标签管理体系 Spec v1.6

> 状态：Draft v1.6（评审修订版，待确认）  
> 日期：2026-10-06（v1.6 复核）；2026-09-23（v1.5 评审）  
> 关联文档：`specs/spec-jiangruijians-blog.md`  
> 目标：将标签从 `posts.tags text[]` 中独立出来，提供标签重命名、停用、趋势统计和防重复能力。
>
> **核心需求（v1.5 确认）**：当前标签是纯手输文本，难以管理和统计。文章编辑页必须支持「下拉选择已有标签；下拉里没有就手输新名称创建；服务端归一化去重后自动写入标签库」，其余能力（标签管理、文章数/最近使用统计、12 个月趋势）按本文档执行。
>
> **v1.6 修订摘要（相对 v1.5，2026-10-06 复核）**
>
> - 澄清发布批次：硬切发布 = **P0 + P1 + P3**；P2（后台标签管理）与 P4 等切读观察期（建议一周）结束后再发布。修复 v1.5 中「P0–P3 合并一次发布」与「切读与 P2 不同批」的自相矛盾（§13.3、§16、§17.1、§18）。
> - 补录统计口径遗漏：后台仪表盘 `getDashboardStats` 的「今年」同样按 `created_at` 统计，引入 `published_at` 后与 `getPublishedStats` 一并改口径（§3、§5.3、§11.1、§18）。
> - §20.4 增补四条实现注意事项（缓存边界禁 Map、`ON CONFLICT` 单目标、slug 截断尾部 `-`、`tags_active_idx` 暂不建）；P3 完成标准补「发布时间」字段（§16）。
>
> **v1.5 修订摘要（相对 v1.4）**
>
> - `published_at` 改为**纯应用层保证**：发布时填了就按填的存、留空则服务端填 `now()`；**不加数据库 CHECK、不引入触发器**。发布时间在后台表单可编辑、新建默认 `now()`（§5.3）。
> - §11.1 补齐 8 处改造遗漏（post-form / post-card / createPost·updatePost / getPostById·getPublishedPostBySlug / validators·post / parseForm），完成标准改为可机检的 grep 断言。
> - §8 新增「事务内先读旧关联，再 diff 更新」的 `post_tags` 算法，禁止全删重建（会重置 `post_tags.created_at`），并明确并发编辑为 last-write-wins。
> - §8 把「下拉选择 + 手输创建 + 自动入库」写成明确的交互契约（键盘操作、无匹配的创建项、停用标签回显、失败提示）。
> - §6.2 补 slug 的并发冲突重试与长度截断规则。
> - 修正 §10/§15.3 的时区措辞：受影响的只是窗口起始月的头 8 小时。
> - §7.5/§12 明确停用标签的前台生效时延，给出 `updateTag`（立即）与 `revalidateTag(..., "max")`（SWR）二选一。
> - §4.2 标注每条不变量的强制层级；§13.2/§13.3 补幂等与切读细则；§14 索引建议调整；§19 文档同步补 `DEPLOY.md`。
> - 已确认**硬切、不双写**：P0–P3 合并为一次低峰发布，切读前备份，回滚靠备份或向前修（§13.3、§17.1）。
>
> **v1.4 修订摘要（相对 v1.3，保留备查）**
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
| 文章发布时间 | 后台表单可编辑，新建默认 `now()`；发布时留空由服务端填 `now()`（纯应用层保证，不加数据库约束） |
| 删除标签 | 有关联时禁止硬删除，需先移除关联或停用 |
| 趋势统计 V1 | 按 `published_at` 统计每月新增已发布文章数 |
| 阅读量趋势 | V1 只提供当前累计阅读量快照 |
| 编辑器标签交互 | 下拉选择已有启用标签；无匹配时手输新名称创建，服务端归一化去重后自动入库（§8） |
| 标签合并 | V1 不实现；需要合并时手动调整文章标签后删除旧标签 |

---

## 2. 目标与非目标

### 2.1 目标

- 标签成为独立实体，可新增、编辑、停用和删除。
- 支持标签描述和启用状态。
- 支持防止大小写、空白、Unicode 变体造成的重复标签。
- 支持文章编辑器的「下拉选择已有标签 + 无匹配时手输创建」；手输的新标签经归一化去重后自动写入标签库，并立即可被后续文章复用。
- 支持标签文章数、最近使用时间和 12 个月新增文章趋势。
- 支持从现有 `posts.tags text[]` 安全迁移和回滚。
- 停用标签不影响已有文章的保存与编辑。
- 后台可直接编辑文章发布时间（默认当前时间），趋势统计按编辑后的时间计算。

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
8. 统计口径不统一：`getPublishedStats` 的「今年」按 `created_at` 统计（`src/lib/db/queries.ts:501`），后台仪表盘 `getDashboardStats` 同样按 `created_at` 统计（`src/lib/db/queries.ts:219`）；引入 `published_at` 后需要一并统一。

---

## 4. 领域模型

### 4.1 实体

- `Tag`：标签实体，保存名称、slug、元数据和生命周期状态。
- `PostTag`：文章与标签的关联实体。
- `published_at`：文章发布时间。后台表单可编辑、新建默认 `now()`，不是「首次发布后冻结」的字段。

### 4.2 数据不变量

| # | 不变量 | 强制层级 |
| --- | --- | --- |
| 1 | `tags.normalized_key` 全局唯一 | DB（UNIQUE 索引） |
| 2 | `tags.slug` 全局唯一且创建后不可修改 | DB（UNIQUE 索引）+ 应用层（不提供编辑入口） |
| 3 | `post_tags(post_id, tag_id)` 全局唯一 | DB（联合主键） |
| 4 | 一篇文章最多关联 10 个标签 | 应用层（zod + 服务端二次校验）；V1 不加 DB 约束（要强制得用触发器，见 §8.2 规则 5） |
| 5 | `post_tags.position` 决定文章内的展示顺序 | 应用层写入顺序 + 读取侧 `order by position` |
| 6 | 公开标签必须满足 `is_active = true`（前台可见性） | 应用层过滤（RLS 不作用于表 owner，见 §12） |
| 7 | 删除文章时级联删除 `post_tags`，不删除标签 | DB（FK ON DELETE CASCADE） |
| 8 | 有文章关联的标签不能硬删除，需先移除关联或停用 | DB（FK ON DELETE RESTRICT）+ 应用层提示 |
| 9 | `posts.published = true` 时应保证 `published_at` 非空（发布时留空则填 `now()`） | 应用层（V1 **不加 DB 约束、不加触发器**，见 §5.3） |
| 10 | 停用标签（`is_active = false`）不允许被新增关联，但既有 `post_tags` 关联保留，文章保存时原样回写 | 应用层（§8.2 规则 2） |

`published_at` 的写入完全由应用层负责（`createPost` / `updatePost`：取表单值，发布时留空则填 `now()`）。已确认**不加数据库 CHECK、也不加触发器**（§5.3）：单个写入方不值得维护「约束必须与写路径同批上线」的时序纪律，个人博客不需要这层复杂度。

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
| `created_at` | `timestamptz` | NOT NULL, now() | **首次关联时间**（已确认语义）：保存文章时按 diff 更新，只增删行、只改 `position`，**不重置**（§8.2 规则 4） |

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
| `published_at` | `timestamptz` | NULL | 文章发布时间。**后台表单可编辑，新建默认 `now()`**；`published = true` 时必须有值 |

字段规则（已确认：后台可编辑，不再冻结「首次发布时间」）：

- 后台文章表单新增「发布时间」输入（`datetime-local`）：新建文章默认当前时间，编辑时回显已存值。
- 保存草稿：填了日期就存，留空存 `NULL`。
- 发布（`published = true`）：填了就按填的存；留空时服务端按 `now()` 填充。
- 已发布文章编辑：就是普通字段，改成什么就存什么——**没有**「首次发布时间不可变」的语义。
- 撤稿（`published = false`）：保留原值。
- 允许填未来时间，但 V1 不做定时发布：到点不会自动上线，`published` 仍是唯一的可见性开关。
- 时区：`datetime-local` 提交的是无时区的 `YYYY-MM-DDTHH:mm`，服务端必须按 `Asia/Shanghai` 解析成 `timestamptz`（**不要**用 `new Date(str)` 直接解析，那会按服务器/UTC 解释，产生 8 小时偏移）；回显与展示同样按 `Asia/Shanghai` 格式化。
- 趋势统计只包含 `published = true AND published_at IS NOT NULL` 的文章，并按 `published_at` 分月——**改了发布时间，趋势就跟着变，这是预期行为**。

**不加数据库约束（已确认）**

`published_at` 只由应用层保证：发布时填了就按填的存，留空则服务端填 `now()`。**不写 CHECK、也不加触发器。**

理由：本项目只有一个写入方（这个 Next 应用），整站一次性部署。一条 `check(...)` 本身不复杂，但它会带来「约束必须与写路径同批上线」的时序纪律（旧代码先于约束上线就会 23514），对个人博客不划算。

代价与兜底：

- 应用层是唯一保证。若用 SQL 脚本 / SQL 编辑器把文章改成 `published = true` 却忘了填时间，数据库不会拦它。
- 趋势查询显式带 `and published_at is not null`（§10），所以脏数据只会「少算一条」，不会报错。
- 任何时候可以跑一条自查，确认没有遗漏：

```sql
select count(*) from posts where published = true and published_at is null;  -- 期望 0
```

- 若将来出现第二个写入方（另一个服务、或手工 SQL 成为常态），再考虑加 CHECK 或触发器；那时的顺序是「先回填 → 写路径上线 → 最后加约束」（v1.4 记录过这个顺序，可作参考）。

说明：

- 对应 §4.2 不变量 9（强制层级：应用层）。
- 统计口径统一：`getPublishedStats`（`src/lib/db/queries.ts:501`）与后台仪表盘 `getDashboardStats`（`src/lib/db/queries.ts:219`）的「今年」当前都按 `created_at` 统计，引入 `published_at` 后一并改按 `published_at`，否则前台与后台口径不一致。

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
- 单测覆盖：`React` / `REACT` / `  React  ` / 中文 / 全角与半角变体（Vitest，见 §15.4）。

### 6.2 slug 生成

创建标签时：

1. 对名称执行 NFKC 和 trim。
2. 英文字母转小写。
3. 空白转 `-`。
4. 保留 Unicode 字母、数字、组合记号（`\p{M}`，避免越南语、印地语等组合字符被拆散）、`-`、`_`、`.`。
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
- 冲突递增（`-2`、`-3`）、空结果随机串兜底、手工指定冲突报错、长度上限（建议 ≤ 60）都在同一处实现并单测（Vitest，见 §15.4）。
- 截断与后缀的顺序：先在「留出后缀长度」的前提下截断（`60 - suffix.length`），再加 `-2` / `-3`，保证最终长度 ≤ 60；中文名 50 字再加后缀也不会越界。自动生成走截断，手工指定则直接报错（不要让用户以为存下来的是自己写的值）。
- 并发：自动后缀（查重 → `-2` → `-3`）必须与唯一索引冲突重试在同一循环里——两个并发请求会撞 `tags.slug` 唯一索引（23505），§8.2 规则 7 的 `on conflict` 只覆盖 `normalized_key`。实现：`insert ... on conflict (slug) do nothing` 后重新生成，或捕获 23505 后重试（设上限，如 5 次后报错）。

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
- **已有文章不受影响**：编辑旧文章时，停用标签以「已停用」标记回显，提交时原样保留关联，不视为新增（见 §8.2 规则 2）。
- **不允许被新增关联**：新建文章或编辑其他文章时，停用标签不出现在可选项中。
- **生效时延（已确认，§18）**：标签的停用/启用/重命名/删除统一用 `updateTag(POSTS_CACHE_TAG)`——立即过期，**下一个请求即返回新数据**（该请求会等一次数据库查询）；文章保存仍用 `revalidateTag(POSTS_CACHE_TAG, "max")`（差一次访问）。理由：标签生命周期操作的语义就是「马上不该再出现」，管理员点完停用刷新前台即可验证，避免「点了怎么还在」的疑惑。

删除：

- 只有无任何文章关联的标签可以硬删除。
- 有文章关联时，必须先移除所有关联或停用。
- V1 不提供强制删除所有关联的一键操作。

---

## 8. 文章标签编辑

### 8.1 编辑器交互（核心需求）

需求背景：当前标签是纯手输文本（`src/components/admin/post-form.tsx:171-179` 的逗号输入框），既无法管理也无法统计。本次改造的核心是：**下拉选择已有标签；下拉里没有的，手输新名称创建，服务端归一化去重后自动写入标签库。**

交互契约（前端组件必须满足，进组件手测/单测清单）：

- 输入框聚焦即展开候选列表，候选为**启用中**的标签，默认按「已发布文章数倒序、名称」排序，展示名称与文章数。
- 输入关键词实时过滤，匹配 `name`、`slug`、`normalized_key`（包含匹配即可）。
- 键盘：`↑` / `↓` 移动高亮，`Enter` 选中当前项或执行创建，`Backspace`（输入为空时）删除最后一个已选，`Esc` 收起；鼠标点选等价。
- 已选项以 chip 展示并带「×」；最多 10 个，达到上限后不再接受新增（继续输入给出提示）。
- 输入内容与某个候选的 `normalized_key` 完全一致时，`Enter` 直接选中该标签，**不进入创建分支**——这是去重的第一道防线。
- 无精确匹配时，列表末尾固定显示一项「创建 "xxx"」；选中后仅在本地记为待创建（`{ name }`），真正落库发生在提交文章时（服务端可能把它解析成已有标签，也可能新建，见 §8.2 规则 3）。
- 停用标签**不出现在候选列表**；但文章原有的停用标签以「已停用」标记回显，可保留、可移除，移除后不能再次加回（§8.2 规则 2）。
- 任何失败（与他人的并发创建撞车、名称超长、slug 不可用等）都必须在字段级显示可读错误，**不得静默丢弃标签**。
- 顺序即 `post_tags.position`（§8.2 规则 4）。

### 8.2 服务端处理

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
3. 无 `id` 时按 normalized key 匹配已有标签（**包含停用标签**，命中后按规则 2 处理）；未命中时创建新标签，新标签默认 `is_active = true`。注意：命中的若是**停用标签**、而该文章原本没有这个关联，必须拒绝并返回可读提示（如「该标签已停用，请先在标签管理里启用，或换一个名称」），**不要静默创建第二行同名标签**——去重检查以 `normalized_key` 为准，包含停用行。
4. 在**同一事务**内写 `posts` 与 `post_tags`，算法是「先读旧、再 diff」，不是先删后插：
   - 先读出该文章现有的 `post_tags`（tag_id 集合），这份快照同时是规则 2「原本就有此关联」的判定依据。
   - 新增：提交里有、旧集合没有 → `insert`，`position` 按提交顺序。
   - 移除：旧集合有、提交里没有 → `delete`。
   - 保留：两边都有 → 只更新 `position`。
   - **禁止 delete-all-then-insert**：那会重置 `post_tags.created_at`（§5.2 定义为「首次关联时间」），也会让「停用标签沿用旧关联」的判定失去依据。
   - 同一篇文章的并发编辑是 last-write-wins（V1 接受，不加行锁）；若以后要求更强一致性，用 `select ... for update` 锁文章行，需另行确认。
5. 保留最多 10 个标签的校验。
6. 仅管理员可以创建或关联标签。
7. 并发安全：
   - `normalized_key`：并行提交同一新标签名会撞唯一索引，创建时用 `insert ... on conflict (normalized_key) do nothing` 后重查该行，或捕获 23505 后重查；不要把唯一键冲突直接抛给用户。
   - `slug`：并发生成同一个 slug 同样会撞 `tags_slug_uidx`，自动后缀与重试必须落在同一循环里（§6.2）。
   - 事务内不要套 `queryWithRetry`（见下），否则重试可能重复建标签。

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
- `PostInput.tags` 由 `string[]` 改为 `PostTagInput[]`；`parseForm`（`src/app/admin/posts/actions.ts:44-48`）改为解析该隐藏字段，不再无条件 `split(",")`；若解析失败要给出字段级错误而不是静默丢弃标签。
- 事务内不要套 `queryWithRetry`：它只针对只读查询，写操作重试可能重复建标签（见 `src/lib/db/index.ts` 的注释）。

过渡期兼容（P0–P5，P5 删除）：

- `parseForm` **同时接受两种 `tags` 字段**：trim 后以 `[` 开头按 JSON 数组解析（新组件），否则按逗号切分（旧输入框）。这样写路径改造可以先于编辑器组件上线，P5 再删掉逗号分支。
- **不双写 `posts.tags`**（已确认硬切，§13.3）：切读后该列冻结为只读遗留数据，直到 P5 删除。
- 写路径同时负责 `published_at`（§5.3）：取表单值；发布时留空则填 `now()`；已发布文章按提交值覆盖（可编辑、不冻结）。过渡期（表单还没有这个字段时）一律按 `now()` 写。

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
| 月新增文章趋势 | 每月发布时间对应的文章数 | `published_at` 经 `Asia/Shanghai` 换算后按月分组 |
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
  and p.published_at is not null          -- 无数据库约束，这里显式排除空值（§5.3）
  and p.published_at >= (
    (date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '11 months')
    at time zone 'Asia/Shanghai'
  )
group by 1
order by 1;
```

时区说明（容易写错，必须按上面写）：

- 窗口起点写成 `date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '11 months'` 会得到 `timestamp`（无时区），与 `timestamptz` 比较时 Postgres 按**会话时区**隐式转换。Supabase 默认 UTC，等于窗口起点整体偏了 8 小时——受影响的只是**窗口起始月**（当前月 −11 个月）1 日 00:00–08:00（Asia/Shanghai）发布的文章：它们被排除在窗口外，该月计数长期偏小；其余月份不受影响。
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

/** 后台候选/回显用：带启用状态 */
type TagOption = TagSummary & { isActive: boolean };

/** 表单传输用（§8）：id = 已存在的标签，name = 待创建的名称 */
type PostTagInput = { id?: string; name?: string };
```

前台 `PostListItem.tags` 从 `string[]` 改为 `TagSummary[]`，组件不得继续使用标签名称拼接 URL。

详情页与后台编辑页的数据源也要改形状，否则拿不到 slug / 停用状态：

- `getPublishedPostBySlug`（`src/lib/db/queries.ts:421`）：join `post_tags` + `tags`，返回 `TagSummary[]`（只含启用标签，停用标签在前台不展示也不进 keywords）。
- `getPostById`（`src/lib/db/queries.ts:188`）：join 后返回 `TagOption[]`，供编辑器回显停用标签。
- `createPost` / `updatePost`（`src/lib/db/queries.ts:249-287`）：改由 §8.2 规则 4 的事务实现，返回类型不变。

### 11.1 改造波及清单（必须逐个处理）

`PostListItem.tags` 与 `Post.tags` 的类型变更会波及下列位置。P1 的完成标准不是「改完这张表」，而是全仓库收敛到可机检的程度（断言见表格之后）：

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
| `src/app/admin/posts/[id]/page.tsx:30` | `tags: post.tags` 传给表单 | 改为 `TagOption[]`（含停用标签与 `isActive`，供回显） |
| `src/components/admin/post-form.tsx:23,171-179` | 逗号文本输入框（`tags?: string[]`），没有发布时间字段 | 换成 §8.1 的标签选择组件（默认值 `TagOption[]`、提交 `PostTagInput[]`）；并新增「发布时间」`datetime-local` 字段（默认 `now()`，§5.3） |
| `src/components/blog/post-card.tsx:36-40` | `post.tags.map(...)` + `<TagBadge key={tag} ...>` | 改 `TagSummary`：`key={tag.id}`、`tag={tag}` 传对象 |
| `src/lib/db/queries.ts:249-287` | `createPost` / `updatePost` 只写 `posts.tags` | 事务内写 `posts`（`published_at` 等字段，**不再写 `tags` 数组**）+ `post_tags`（§8.2 规则 4） |
| `src/lib/db/queries.ts:188` | `getPostById` 返回 `Post`（tags 为 `string[]`） | join 关系表返回 `TagOption[]`（含停用标签，供回显） |
| `src/lib/db/queries.ts:421` | `getPublishedPostBySlug` 返回 `Post`（tags 为 `string[]`） | join 关系表返回 `TagSummary[]`（仅启用标签） |
| `src/lib/db/queries.ts:390` | `searchPublishedPosts` 经 `listColumns` 带出 tags | 随 `listColumns` 一起改为 `TagSummary[]` |
| `src/lib/db/queries.ts:219` | `getDashboardStats` 的 thisYear 按 `createdAt` 统计 | 改按 `published_at`（§5.3 口径统一；后台查询不缓存，无缓存边界问题） |
| `src/lib/validators/post.ts:11` | `tags: z.array(z.string()...)` | 改为 §8.2 的 `PostTagInput` union；新增 `publishedAt`（空字符串或合法时间，§5.3） |
| `src/app/admin/posts/actions.ts:44-48` | `parseForm` 内 `.split(",")` | 解析 JSON 隐藏字段（保留逗号兼容分支，§8.2 过渡期）；解析 `publishedAt` 并按 `Asia/Shanghai` 转成时间（§5.3） |

机检断言（P1 收尾跑一遍，预期只剩白名单）：

```bash
# 1) 不应再直接读/写数组列：预期只剩 schema.ts 的列定义 + 回填脚本
rg -n "posts\.tags|arrayContains\(posts\.tags" src/ scripts/
# 2) 不应再用标签名称拼 URL
rg -n "encodeURIComponent\((tag|t)\)" src/
# 3) 组件不应再拿字符串当标签
rg -n "tags: string\[\]" src/
```

白名单只有两处：`src/lib/db/schema.ts`（列定义，P5 删除）与 `scripts/backfill-tags.ts`（一次性回填脚本）。

注意：`getPublishedStats`（`queries.ts:496-516`）改用 `published_at` 后同样要处理缓存边界（现返回 ISO 字符串，保持一致即可）；`getDashboardStats`（`queries.ts:211-233`）不缓存，直接改 SQL 即可。

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
- **失效方式已确认（§18）**：按操作类型分开用，同一个 tag 混用两种语义是允许的。
  - 标签的写操作（新建 / 重命名 / 停用 / 启用 / 删除）→ `updateTag(POSTS_CACHE_TAG)`：立即过期，**下一个请求阻塞等待新数据**。Next 16 新增，**仅 Server Action 内可用**——标签的 Server Actions 正好满足这个前提。
  - 文章保存 → `revalidateTag(POSTS_CACHE_TAG, "max")`：stale-while-revalidate，**第一个请求仍返回旧数据**（后台开始刷新）、第二个才是新数据，访客永远不用等。沿用现有 `src/app/admin/posts/actions.ts:26` 的写法。
  - Route Handler 里不能用 `updateTag`，只能用 `revalidateTag`；那里若要「立即」效果用 `revalidateTag(tag, { expire: 0 })`。
  - 兜底说明：`cached()` 自身带 `revalidate: 60`，即使完全不调用失效函数，缓存最迟 60s 后也会在下一次访问时刷新——这是兜底，不要拿它当「立即生效」的实现。
  - 验收口径见 §15.3：停用标签后，**下一个请求**就必须看不到它。
- 标签相关 Server Actions 除 `revalidatePath("/admin/tags")` 外，编辑/详情页的 `revalidatePath("/admin/tags/[id]", "page")` 需一并处理，不能只失效列表。
- 所有 Server Actions 必须调用 `isAdmin()`，不能只依赖 layout 鉴权（仓库现有惯例：`src/app/admin/posts/actions.ts:58,75,88` 逐个校验）。
- id、name、slug 和描述全部在服务端校验，长度上限见 §5.1。
- 不允许客户端修改 `normalized_key` 和时间字段。
- 创建和更新必须使用事务：`db.transaction(...)` 包裹「解析/创建标签 + 读旧 `post_tags` + diff 写 `post_tags` + 写 `posts`（含 `published_at`）」。这是本仓库首次引入事务（当前代码零事务），注意事务内不要套 `queryWithRetry`。
- `tags.updated_at` 没有数据库触发器，改名/停用/改描述时由应用层显式写入 `now()`（与 `posts.updatedAt` 的现状一致）。
- RLS 落点：`tags`、`post_tags` 的 RLS 与策略写在 `supabase/rls.sql`（与现有分工一致：表结构走 Drizzle 迁移，RLS/索引/RPC 走 SQL 脚本，见 `specs/spec-jiangruijian-blog.md` 第 5.2 节的职责说明）。
- `tags` 和 `post_tags` 启用 RLS，不开放匿名直接写策略。
- `post_tags` 不开放匿名直读，避免暴露草稿关联；注意 RLS 不作用于表 owner（Drizzle 直连用户），所以真正的防线仍是应用层 `isAdmin()`。

---

## 13. 数据库迁移

采用「扩展、回填、切读、清理」流程——**不保留兼容双写**（已确认硬切，见 §13.3）。

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
2. 为 `posts` 增加 `published_at`（可空；不加数据库约束，见 §5.3）。
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
8. 已发布文章的 `published_at` 以 `created_at` 回填（通常文章创建与首次发布在同一时间窗，比 `updated_at` 更接近真实发布时间）。**必须带 `where published_at is null`**，否则重复执行会覆盖应用层后来写入的正确值（撤稿重发场景尤其明显）。
9. 草稿保持 `published_at = NULL`。
10. 回填完成后跑一次自查，确认没有「已发布但时间为空」的遗漏——没有数据库约束，这条自查就是兜底（§5.3）：

```sql
select count(*) from posts where published = true and published_at is null;  -- 必须为 0
```

规范名称选择：

- 优先出现次数最多的写法。
- 次数相同选择较短的名称。
- 再相同使用稳定字典序。

旧 URL 兼容依赖 normalized key 回退解析，不创建别名表。

### 13.3 切读（硬切，不双写）

已确认：**采用低峰硬切、不保留兼容双写**——站点体量小、只有一个作者，过渡逻辑（双写 + P5 清理 + "改名后数组不再一致"的隐患）的复杂度大于它买到的那点回滚能力。

1. 一次发布完成切读：前台、后台、文章写入全部切到关系表。
2. `posts.tags` 切换后**只读遗留**：代码不再写入它，它停留在切读那一刻的内容，仅在"还没删列"的过渡期用于排错对照。
3. 切读发布前必须做齐三件事：本地跑通、回填完成（含 §13.2 自查）、**数据库备份**（回滚手段见 §17）。
4. 旧编辑器（逗号输入）期间仍可用：`parseForm` 的逗号分支（§8.2 过渡期）把它转成同样的 `PostTagInput[]`，只是结果只写关系表。
5. 观察一段时间（建议至少一周、并覆盖"新建 / 编辑 / 发布 / 撤稿 / 标签改名"全流程）确认无异常后，进入 §13.4 清理。

代价与注意：

- **没有"代码回退到数组模式"的退路**：切读后 `posts.tags` 不再更新，回退旧代码只会读到冻结的旧数据。出问题只能向前修，或按 §17 恢复备份。
- 因此**切读与 P2（后台标签管理，会开始改标签名）不要放在同一次发布里**，中间留观察期。

### 13.4 清理

1. 确认关系数据完整。
2. 确认无回滚需求。
3. 修改 `src/lib/db/schema.ts` 删除 `tags` 列，用 `pnpm db:generate` 生成迁移并执行（**不要手写 SQL 改表**，否则 schema 与数据库会长期漂移，`db:generate` 会一直报差异）。
4. `posts_tags_gin` 无需单独 drop：Postgres 在删除 `tags` 列时会自动删除依赖该列的索引。但必须**手动删除 `supabase/rls.sql:29` 的 `create index if not exists posts_tags_gin` 这一行**，否则下次执行该脚本（它只 `create ... if not exists`，不会因列不存在而失败判断）会尝试重建索引并报错。
5. 更新主 SPEC、README 和 RLS 文档。

### 13.5 迁移验收

- 每个旧标签映射到唯一 normalized key。
- 去重后的关联数一致。
- 每篇文章的标签集合一致（忽略顺序）。
- 无重复 `(post_id, tag_id)`。
- 已发布文章 `published_at` 均不为空（应用层保证；回填后跑 §13.2 的自查 SQL 确认）。
- 迁移前后行数核对：`posts` 数量不变；`tags` 的 distinct `normalized_key` 数 = 去重后的旧标签数；`post_tags` 行数 = 去重后的关联数。
- 回填脚本连跑两次结果一致（幂等）。
- 旧大小写和空格 URL 可解析到 canonical slug。
- `posts.tags` 与 `posts_tags_gin` 在清理前保持"只读遗留"状态（代码不再写入），随 P5 一起删除。

### 13.6 ⚠️ 禁止使用 `pnpm db:push`（实测结论）

**结论：本项目的 schema 变更只能用 `db:generate` + `db:migrate`，绝对不要用 `db:push`。**

原因：`drizzle-kit push` 会 introspect 真实数据库，把「数据库里有、但 `schema.ts` 里没有」的对象一律视为多余并删除。本项目大量对象由 `supabase/rls.sql`、手工 SQL、以及 Drizzle 之外的方式创建，全部落在它的清理范围内。

实测（drizzle-kit 0.31.10，独立 Postgres 实例）——对一份已按 `rls.sql` 建好对象的库执行 `push`，它准备执行（其中的 CHECK 是当时为验证 push 行为临时加的，v1.5 方案已不使用它）：

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
- **已确认：直接从 `package.json` 删除 `db:push` 脚本**（同时改掉 README 的用法表与 DEPLOY 的迁移说明，随 v1.5 一并提交）。真要用的那天只能临时敲 `pnpm exec drizzle-kit push`——按本文档结论不应使用，先用 `pg_dump` 备份并事后重跑 `supabase/rls.sql`。

---

## 14. 索引与性能

```sql
-- UNIQUE 约束已自带唯一索引：tags_normalized_key_uidx、tags_slug_uidx（由 Drizzle schema 定义）
-- 可选：单列 is_active 选择度很低，V1 建议先不加；确需"只看启用标签"时用 partial index
create index tags_active_idx on tags (is_active) where is_active;
create index post_tags_tag_id_idx on post_tags (tag_id, post_id);
create index posts_published_at_idx on posts (published, published_at);
```

说明：

- 不在 SQL 里重复创建 `unique` 索引：`normalized_key` / `slug` 的唯一性由 Drizzle schema 的 `.unique()` 表达，`db:generate` 会生成对应的唯一索引/约束；两处都建会出现同名重复对象。
- `is_active` 的收益有限（表小、查询多带其他条件）：V1 建议**先不加**这个索引；若后台状态筛选真的慢，再加 partial index（`where is_active`），或按 `EXPLAIN ANALYZE` 的结果决定。
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
- 手输的新标签名在已有同归一化 key 的标签时被解析到既有标签，只产生一行 `tags`（去重生效）。
- 并发创建同名标签、自动 slug 也相同时，不把 23505 抛给用户，最终只有一行。
- 编辑文章并再次保存（标签集合不变）后，`post_tags.created_at` 不变（走 diff，不是全删重建）。
- 发布时留空 → 服务端自动填 `now()`（应用层规则；不加数据库约束，靠 §13.2 的自查 SQL 兜底）。

### 15.2 前台

- `/tags` 只显示公开标签。
- `/tags/[slug]` 正确显示名称、描述和文章。
- 旧大小写、空格 URL 永久重定向到 canonical URL：以 `curl -I /tags/React` 断言 308 + 正确 `Location`；若实测拿不到真 308（`permanentRedirect` 在流式渲染下只插入 meta），则退化为「页面可见即跳转到 canonical」，并在 metadata 中输出 canonical，同时把结论记入本文档。
- 标签改名后：新名称 URL 404、原 slug URL 正常、旧名称 URL 404（符合 §6.3 限制）。
- 停用标签返回 404，不进入 sitemap，也不出现在文章徽章与 JSON-LD keywords 中。
- 文章卡片、详情、搜索、OG 图和分享海报显示正确标签。
- 首页标签 chips（`home-feed.tsx`）来源正确（不再只依赖当前页文章）。
- 编辑器下拉无匹配时手输创建：提交后新标签入库，且该标签在下一篇新文章的候选列表里立刻可选。
- 所有标签链接使用 slug。

### 15.3 后台

- 非管理员无法调用任何标签 Server Action。
- 新建、编辑、重命名、停用、启用、删除符合规则。
- 重命名不改变 URL。
- normalized key 冲突时提示已有同名标签。
- 趋势图包含连续 12 个自然月（中国时区），草稿不计入。
- 趋势边界用例：窗口起始月（当前月 −11 个月）1 日 00:00–08:00（Asia/Shanghai）发布的文章仍被计入该月；窗口起点前 1 小时发布的文章被排除。
- 累计阅读量标注为快照。
- 停用标签走 `updateTag`：**停用后的下一个请求**就看不到该标签（标签云、文章徽章、标签页、sitemap 同步）。
- 发布时间可编辑：改成过去某天保存后，前台显示与趋势统计都按新时间；发布时留空则按 `now()` 填充。
- 发布时间的时区用例：表单填 `2026-01-01 00:30`（北京时间）保存后，库里是 `2025-12-31T16:30:00Z`，页面回显仍是 `2026-01-01 00:30`。
- 标签改名后，`posts.tags`（只读遗留列）保持切读时的旧值——这是硬切的预期行为，不要拿它当事实来源（§13.3）。

### 15.4 工程

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`（新增，见下）
- `pnpm build`
- 主要查询执行 `EXPLAIN ANALYZE`（标签页、计数、趋势）
- 迁移前后核对 `posts`、`tags`、`post_tags` 数量

单测（**已确认选型：Vitest**）：

- `devDependencies` 加 `vitest`（用 `pnpm add -D vitest` 取当前稳定版）；只影响开发，不进生产包。
- `package.json` 加脚本：`"test": "vitest run"`、`"test:watch": "vitest"`。
- 默认 `node` 环境即可（被测的是纯函数，不需要 jsdom）。
- 测试文件与被测模块**同目录、用相对路径 import**，这样**不需要 `vitest.config.ts`**——Vitest 不读 tsconfig 的 `@/*` 别名，将来要给别的模块写测试再加配置与 alias 插件。
- tsconfig 的 `include` 是 `**/*.ts`，测试文件同样会被 `pnpm typecheck` 覆盖；Vitest 的类型通过 `import { describe, it, expect } from "vitest"` 引入，不依赖全局类型。
- 覆盖范围（对应 §6.1 / §6.2 的实现要求）：
  - `src/lib/tags/normalize.test.ts`：`React` / `REACT` / `  React  ` / 中文 / 全角与半角变体归一到同一个 `normalized_key`；`normalizeTagName` 保留显示大小写。
  - `src/lib/tags/slug.test.ts`：NFKC + 小写 + 空白转 `-` + 保留 `\p{L}\p{N}\p{M}._-`；空结果走 `tag-<8 位随机串>`；冲突追加 `-2` / `-3`；截断到 60（含后缀长度）；手工指定超长报错。
  - 去重：同一组输入里 `React` 与 `REACT` 只保留一个，顺序按首次出现。
- 为什么值得：这两个模块是**回填脚本与运行时共用**的实现（§6.1、§6.2、§13），单测同时保护迁移结果与日常写入两条路径。

---

## 16. 实施阶段

| 阶段 | 内容 | 完成标准 |
| --- | --- | --- |
| P0 | 表结构迁移（`tags` / `post_tags` / `published_at`）、回填、写路径改造：`parseForm` / validator 改收 `PostTagInput[]`（保留逗号兼容）、`createPost` / `updatePost` 写 `published_at`（表单值，留空填 `now()`）+ 写 `post_tags`（不再写 `posts.tags`） | 数据完整、回填幂等、旧代码仍可运行；发布/编辑/撤稿重发均正常（此阶段表单还没有时间字段，一律按 `now()` 写，P3 接上可编辑字段）；§15.4 的归一化 / slug / 去重单测通过（`pnpm test`） |
| P1 | 数据访问层、前台标签页和组件改造 | 前台无回归，旧 URL 可解析，§11.1 的机检断言只剩白名单 |
| P2 | 后台 CRUD、重命名、停用 | 标签可完整管理，停用不影响旧文章保存，启用可逆 |
| P3 | 文章编辑器标签选择（下拉 + 手输创建）+「发布时间」`datetime-local` 字段（§5.3） | 新文章不再产生标签变体；手输新标签自动入库并可立即复用；发布时间可编辑，发布时留空自动填 `now()` |
| P4 | 统计与 12 个月趋势 | 趋势和阅读量快照可查看，时区边界用例通过 |
| P5 | 删除旧数组和文档同步 | 主 SPEC / README / DEPLOY 更新完成，schema 无漂移 |

P0、P1、P3 合并为一次切读发布（§17.1）；P2、P4 在切读观察期（建议一周，§13.3）结束后发布；P5 最后执行。

**全程禁止 `pnpm db:push`**（原因见 §13.6）：只走 `pnpm db:generate` + `pnpm db:migrate`。P0 的建表与加列都用这两条命令完成。

若 P0 与 P1 分两次发布，中间存在时间窗：此期间旧代码仍在写 `posts.tags`，且旧代码发布的文章不带 `published_at`。切读（P1）前需重跑一次回填脚本（幂等，见 §13 方案落点与 §13.5）补齐这两类增量——脚本按 `published_at is null` 补发布时间（§13.2 规则 8）。

按 §17.1 的硬切方案把 P0 + P1 + P3 合并成一次发布时，这个窗口不存在；但仍建议切读前重跑一次回填（成本极低），并在切读后确认 `posts.tags` 已冻结、不再被写入（§13.3）。

---

## 17. 回滚策略

- 已确认硬切（§13.3）：**没有"代码回退到数组模式"的退路**——切读后 `posts.tags` 冻结，回退旧代码只会读到冻结数据。
- 切读前必须先备份（Supabase 侧备份或 `pg_dump`），这是硬切唯一可靠的退路。
- 出问题的首选是**向前修**：`tags` 与 `post_tags` 都是新增结构，数据本身不受影响，修代码通常比回放备份便宜。
- 数据异常时停止切读，修复回填后重新执行（回填幂等，可安全重跑）。
- 执行 P5（删列）前必须再备份一次；删除旧列后只能依赖备份或由关系表重建数组。
- 没有数据库约束，回滚不需要动数据库结构；代价是回滚期间新发布的文章 `published_at` 为空，趋势与「最近使用时间」会漏掉它们——重跑一次回填脚本即可补齐（§13.2 规则 8）。

### 17.1 硬切方案（已采用）

v1.5 已确认**不保留双写**；v1.6 澄清批次：**P0 + P1 + P3 合并为一次低峰发布完成切读**，P2（后台标签管理）与 P4 在观察期后单独发布。理由：站点体量小、只有一个作者，双写带来的过渡逻辑与"改名后数组不再一致"的隐患，比它买到的那点回滚能力更贵。

配套纪律：

- 切读前必须先备份（§17）。
- **P2 不与切读同批**：P2 一上线就会开始改标签名，前台展示立刻变化，与切读的风险叠加不好排查；等观察期（建议一周，§13.3）结束再发。
- 切读上线后只**向前修**，不再尝试回退到数组模式。

---

## 18. 待评审确认点

已确认（v1.5，来自需求方）：

- 编辑器交互：下拉选择已有标签；下拉里没有就手输新名称创建，服务端归一化去重后自动入库（§8.1）。
- 其余能力（标签新增/重命名/停用/删除、标签统计、趋势统计）按本文档执行。
- 标签写操作的前台失效用 `updateTag`（立即生效）；文章保存保持 `revalidateTag(..., "max")`（§12）。
- `published_at` 由应用层写值（表单值；发布时留空则 `now()`），**不加数据库 CHECK、不引入触发器**（§5.3）。
- 发布时间在后台表单开放编辑、新建默认 `now()`，不再有「首次发布时间冻结」语义（§5.3）。
- `post_tags.created_at` 保持「首次关联时间」语义：保存文章按差异更新（diff），不做全删重建（§5.2、§8.2 规则 4）。
- 采用**硬切、不双写**：P0 + P1 + P3 合并为一次低峰发布，切读前备份；P2 与 P4 等观察期结束再发布；回滚靠备份或向前修（§13.3、§17.1）。
- 引入 **Vitest** 承载 §6 的单测：`package.json` 加 `pnpm test`，测试文件与模块同目录、相对路径 import，不需要配置文件（§15.4）。
- `getPublishedStats` 与 `getDashboardStats` 的「今年」统一按 `published_at` 统计（会改变现有数字，接受；§5.3、§11.1）。
- 从 `package.json` **删除** `db:push` 脚本，README / DEPLOY 同步移除（§13.6）。

其余已定稿的设计点（如有异议请指出）：

1. V1 slug 创建后完全不可修改。
2. V1 不保存"重命名前的旧名称"作为可输入别名。
3. V1 不实现标签合并，需要时手动调整文章标签。
4. 有文章关联的标签禁止硬删除，只允许停用。
5. 趋势指每月新增已发布文章数，不是月度阅读量趋势。
6. 阅读量只展示当前累计快照。
7. 元数据范围：名称、slug、描述、启用。
8. 文章最多关联 10 个标签。
9. 停用标签：允许保留既有文章的关联，禁止新增关联（§7.5 / §8.2）。
10. 旧名称被其他标签复用后，旧链接指向新标签（内容漂移）；V1 不做检测（§6.3）。

至此评审确认点全部关闭（v1.5 于 2026-09-23，v1.6 修订于 2026-10-06），可继续实施（§16、§20）。

---

## 19. 与主 SPEC 同步

功能实现后更新：

- `specs/spec-jiangruijians-blog.md` 的数据库设计（表从 `posts + settings` 变为 `posts + settings + tags + post_tags`，`posts` 增加 `published_at`）。
- 目录结构中的 `/admin/tags`、`src/lib/tags/*`、`scripts/backfill-tags.ts` 和相关文件。
- S7 标签能力说明。
- `README.md` 的标签与后台功能说明（其中 `db:push` 用法与警告已在 v1.5 提交时改好，见 §13.6）。
- `DEPLOY.md` 的迁移流程说明（`db:push` 已在 v1.5 提交时改为 `db:generate` + `db:migrate`，见 §13.6）。
- 迁移、RLS 和索引记录（含 `posts_tags_gin` 的移除；`published_at` 无数据库约束，见 §5.3）。

本 SPEC 已于 2026-09-23 评审通过（v1.5），2026-10-06 复核修订（v1.6）；实施按 §16 的阶段与 §20 的进度推进。

---

## 20. 实施进度

> **用法**：这里记录「实际写到哪了」。隔几天回来接着写时，先看 §20.1 的当前切片，再看 §20.2 的已完成项。
> **工作方式（v1.5 约定）**：按切片推进，每片 5–20 行代码 + **一次可运行的验证**；不留「写了一半」的代码。
> **同步约定**：每完成一个切片，更新 §20.1 的状态与 §20.2 的记录（含日期）；spec 与实现分开提交。

### 20.1 当前阶段：P0 完成，下一阶段 P1（数据访问层与前台）

| # | 切片 | 验证点（必须跑） | 状态 |
| --- | --- | --- | --- |
| 1 | 装 Vitest + 第一条最小测试 | `pnpm test` → `Tests 1 passed` | ✅ 2026-09-24 完成 |
| 2 | `normalizeTagName` 的 NFKC / 全角空格断言（并把首条用例的尾部空白补回去） | `pnpm test` 绿；反向实验（去掉 `NFKC`）能变红 | ✅ 2026-10-06 完成（反向实验已验证） |
| 3 | `normalizeTagKey` 的断言 | `pnpm test` 绿 → `src/lib/tags/normalize.ts` 完成 | ✅ 2026-10-06 完成 |
| 4 | `slugifyTagName` 的断言 | `pnpm test` 绿 | ✅ 2026-10-06 完成 |
| 5 | `withTagSlugSuffix`（含 60 截断） | `pnpm test` 绿 | ✅ 2026-10-06 完成 |
| 6 | `buildTagSlug`（随机兜底 + 超长截断） | `pnpm test` 绿 | ✅ 2026-10-06 完成 |
| 7 | `normalizeManualTagSlug`（两个抛错） | `pnpm test` 绿 → `src/lib/tags/slug.ts` 完成 | ✅ 2026-10-06 完成 |
| 8 | `pnpm format` + `pnpm typecheck` + 提交 | 三绿 + 1 commit | ✅ 2026-10-06 完成（`4223f3d`） |

### 20.2 已完成

- **2026-09-23** spec v1.5 定稿并提交（`bb99106`）：删除 `db:push` 脚本，README / DEPLOY 同步。
- **2026-09-24** 工具链就绪：`vitest@5.0.1` 写入 devDependencies；`package.json` 增加 `test` / `test:watch`；新增 `.editorconfig` 与 `.vscode/settings.json`（2 空格缩进、保存即 Prettier 格式化）——从根上解决缩进漂移，比手动改格式更好。
- **2026-09-24** 第 1 片完成：`src/lib/tags/normalize.ts` 首版（NFKC → trim → 空白折叠）+ `normalize.test.ts` 首条用例，`pnpm test` → `Tests 1 passed`；`src/lib/tags/` 通过 `prettier --check`。
- **2026-10-06** spec v1.6 复核修订：澄清发布批次（切读 = P0+P1+P3，P2/P4 观察期后单独发布）、补录 `getDashboardStats` 的「今年」口径、§20.4 增补实现注意事项。
- **2026-10-06** P0-① 完成并提交（`4223f3d`）：`normalizeTagKey` 与 `src/lib/tags/slug.ts`（`slugifyTagName` / `withTagSlugSuffix` / `buildTagSlug` / `normalizeManualTagSlug`），单测 21 条全绿；tsconfig 加 `allowImportingTsExtensions`（回填脚本的 `.ts` 相对导入需要）。
- **2026-10-06** P0-②③ 完成并提交（`f6b1835`）：schema 加 `tags` / `post_tags` / `posts.published_at`；`pnpm db:generate` 生成 `drizzle/0001_wet_spyke.sql`（**只生成未执行**，§20.3 原约定）；rls.sql 加 RLS、`tags_public_read`（仅 `is_active = true` 可匿名读）、`post_tags` 无策略（不开放匿名直读）与 §14 的两个索引（`tags_active_idx` 按 §20.4 不建）。
- **2026-10-06** P0-④ 完成并提交（`ab97d98`）：`scripts/backfill-tags.ts`——幂等回填（tags 按 `normalized_key` 复用、`post_tags` on conflict 跳过、`published_at` 只补空值并跑 §13.2 自查），复用 `src/lib/tags` 纯函数模块；typecheck 绿，Node 直跑冒烟通过（迁移未执行时对库干净失败回滚，证明加载/连接/事务路径可用）；**真实回填待迁移执行后**（见 §20.3 runbook）。
- **2026-10-06** P0-⑤ 完成并提交（`7d71e8d`）：validator 改收 `PostTagInput[]` 并新增 `publishedAt`；`parseForm` 支持新 JSON 隐藏字段 + 旧逗号分支（§8.2 过渡期，P5 删）；`createPost`/`updatePost` 首次引入事务——先读旧关联再 diff 写 `post_tags`（保留 `created_at` 语义），发布留空填 `now()`，不再写 `posts.tags`；停用标签按 §8.2 规则 2/3 拒绝或保留；并发用不带 target 的 `on conflict do nothing` + 回查（§20.4）。验证：`pnpm test`（21 绿）+ typecheck + lint + build 全绿。**本地联调写路径前需先 `db:migrate` + 回填**。

### 20.3 待办（P1 起，按 §16 阶段推进）

- **P1** 数据访问层与前台改造：§11 的 API 形状 + §11.1 波及清单逐项处理（含 v1.6 补录的 `getDashboardStats` 口径）；完成标准是 §11.1 末尾的机检断言只剩白名单（`schema.ts` 列定义与 `scripts/backfill-tags.ts`）。
- **P3** 编辑器标签选择组件（§8.1 交互契约：下拉 + 手输创建 + 键盘操作）+「发布时间」`datetime-local` 字段（§5.3、§16）。
- **P2 / P4**（后台标签管理 + 统计趋势）在切读观察期后发布，不与切读同批（§17.1）。
- **P5** 删除 `posts.tags` 列与 `rls.sql:29` 的 `posts_tags_gin` 行、删除逗号兼容分支、文档同步。
- **切读发布 runbook（P0+P1+P3 一次发布，§17.1）**：备份（Supabase/pg_dump）→ `pnpm db:migrate`（0001）→ 执行 `supabase/rls.sql`（新增段）→ `node scripts/backfill-tags.ts`（幂等，跑两次核对对账输出）→ 发布代码 → 验证 `posts.tags` 已冻结不再被写入、§15.1/§15.2 验收项。

### 20.4 实施约定

- 提交信息沿用仓库习惯：`feat(tags): …` / `test(tags): …` / `chore: …`。
- 每一片的「验证点」没跑绿，不进入下一片。
- 报错先自己完整读一遍再往下走（读错误信息是核心技能）。
- 每片结束时三件事一起跑：`pnpm test` + `pnpm typecheck` + `pnpm format`。
- **缓存边界禁 Map**（§10、§11）：跨 `unstable_cache` 边界的返回值只用原始类型和普通对象——`Map` 序列化后变 `{}`；`listPostTags` 返回 `Array<{ postId, tags }>` 之类结构，时间字段沿用 ISO 字符串约定。
- **并发创建标签**（§8.2 规则 7）：一条 INSERT 只能有一个 `ON CONFLICT` 子句——用不带 target 的 `on conflict do nothing`（同时覆盖 `normalized_key` 与 `slug` 两个唯一约束），随后按 `normalized_key` 重查：查到行 = 复用已有标签；查不到 = slug 被占，重新生成再试（设上限，如 5 次）。
- **slug 截断**（§6.2）：按 `60 - suffix.length` 截断后，若基础串以 `-` 结尾要再 strip 一次，避免拼出 `xxx--2`。
- **`tags_active_idx` 不建**（§14）：V1 先不加 is_active 索引，§14 SQL 块里的那行不要照抄。
