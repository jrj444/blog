# 标签管理体系 Spec v1.3

> 状态：Draft v1.3（评审修订版）  
> 日期：2026-09-22  
> 关联文档：`specs/spec-jiangruijians-blog.md`  
> 目标：将标签从 `posts.tags text[]` 中独立出来，提供标签重命名、停用、趋势统计和防重复能力。

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
| 停用标签 | `is_active = false`，前台隐藏，数据保留 |
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

### 2.2 非目标

- 标签合并（V1 通过手动调整文章标签实现，文章量大时再考虑自动化）。
- 标签层级、父子标签和分类树。
- 多作者权限与标签审核流。
- AI 自动推荐标签。
- 任意修改 slug 及完整历史重定向链。
- 精确的月度阅读量趋势。
- 标签多语言翻译。
- 独立的 SEO 标题和 SEO 描述字段。

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
6. 公开标签必须满足 `is_active = true`。
7. 删除文章时级联删除 `post_tags`，不删除标签。
8. 有文章关联的标签不能硬删除，需先移除关联或停用。

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
| `is_active` | `boolean` | NOT NULL, true | 是否允许公开访问 |
| `created_at` | `timestamptz` | NOT NULL, now() | 创建时间 |
| `updated_at` | `timestamptz` | NOT NULL, now() | 最近修改时间 |

说明：

- `normalized_key` 负责防重复，不能用 slug 替代。
- `slug` 支持 Unicode，不强制转拼音。
- V1 不保存 `post_count`，统计实时查询或缓存，避免计数漂移。

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

### 6.3 URL 解析

`/tags/[slug]` 按以下顺序解析：

1. 不区分大小写匹配 `tags.slug`（slug 全小写存储，但用户可能访问大小写混合的旧 URL）。
2. 未命中时，将 URL 参数按标签名称归一化，匹配 `normalized_key`。
3. 最终地址与当前 URL 不同时执行永久重定向。
4. 目标标签停用或不存在时返回 404。

这样可以兼容迁移前的 `/tags/React`、`/tags/REACT` 和 `/tags/React%20Server%20Components` 等旧地址，而不需要别名表。

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
- 前台标签云、标签页、sitemap 和文章徽章中隐藏。
- `post_tags` 和统计数据保留。
- 管理后台可恢复启用。

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

1. 按 normalized key 去重。
2. 有 `id` 时验证标签存在且启用。
3. 无 `id` 时按 normalized key 匹配已有标签；未命中时创建新标签。
4. 在同一事务中写文章和 `post_tags`。
5. 保留最多 10 个标签的校验。
6. 仅管理员可以创建或关联标签。

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
- 文章 keywords 使用标签名称。

sitemap：

- 只输出公开且至少关联一篇已发布文章的标签。

RSS：

- 标签继续输出名称，不改变 RSS 语义。

---

## 10. 趋势与统计

V1 指标：

| 指标 | 定义 | 数据来源 |
| --- | --- | --- |
| 已发布文章数 | 当前关联的已发布文章数 | `post_tags + posts` |
| 草稿关联数 | 当前关联但未发布的文章数 | `post_tags + posts` |
| 累计阅读量快照 | 当前关联已发布文章的 `views` 总和 | `sum(posts.views)` |
| 月新增文章趋势 | 每月首次发布时间对应的文章数 | `date_trunc('month', published_at)` |
| 最近使用时间 | 最大 `published_at` | `max(posts.published_at)` |

趋势查询：

```sql
select
  date_trunc('month', p.published_at at time zone 'Asia/Shanghai') as month,
  count(*)::int as count
from post_tags pt
join posts p on p.id = pt.post_id
where pt.tag_id = $1
  and p.published = true
  and p.published_at >= date_trunc('month', now() at time zone 'Asia/Shanghai') - interval '11 months'
group by 1
order by 1;
```

UI 必须补齐缺失月份为 0，展示连续 12 个自然月。

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

---

## 12. 缓存、权限与安全

写操作统一失效：

```ts
revalidateTag(POSTS_CACHE_TAG, "max");
revalidatePath("/", "layout");
revalidatePath("/admin/tags");
```

原则：

- 前台标签云、标签页、文章标签投影挂 `POSTS_CACHE_TAG`。
- 后台列表、统计和趋势不缓存。
- 创建、更新、停用、删除后立即失效缓存。
- 所有 Server Actions 必须调用 `isAdmin()`，不能只依赖 layout 鉴权。
- id、name、slug 和描述全部在服务端校验。
- 不允许客户端修改 `normalized_key` 和时间字段。
- 创建和更新必须使用事务。
- `tags` 和 `post_tags` 启用 RLS，不开放匿名直接写策略。
- `post_tags` 不开放匿名直读，避免暴露草稿关联。

---

## 13. 数据库迁移

采用"扩展、回填、切读、兼容双写、清理"流程。

### 13.1 扩展

1. 创建 `tags` 和 `post_tags`。
2. 为 `posts` 增加 `published_at`。
3. 保留 `posts.tags` 和 `posts_tags_gin`。
4. 添加约束与索引。
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

规范名称选择：

- 优先出现次数最多的写法。
- 次数相同选择较短的名称。
- 再相同使用稳定字典序。

旧 URL 兼容依赖 normalized key 回退解析，不创建别名表。

### 13.3 切读与双写

1. 前台、后台和文章写入切换到关系表。
2. 文章写入仍同步更新 `posts.tags`。
3. 验证一段时间后再清理。
4. 注意：一旦在后台执行过标签重命名，`posts.tags` 数组将不再与关系表保持一致，不再支持回滚到旧数组模式。应尽快推进至清理阶段。

### 13.4 清理

1. 确认关系数据完整。
2. 确认无回滚需求。
3. 删除 `posts.tags`。
4. 删除 `posts_tags_gin`。
5. 删除双写代码。
6. 更新主 SPEC、README 和 RLS 文档。

### 13.5 迁移验收

- 每个旧标签映射到唯一 normalized key。
- 去重后的关联数一致。
- 每篇文章的标签集合一致（忽略顺序）。
- 无重复 `(post_id, tag_id)`。
- 已发布文章 `published_at` 均不为空。
- 旧大小写和空格 URL 可解析到 canonical slug。

---

## 14. 索引与性能

```sql
create unique index tags_normalized_key_uidx on tags (normalized_key);
create unique index tags_slug_uidx on tags (slug);
create index tags_active_idx on tags (is_active);
create index post_tags_tag_id_idx on post_tags (tag_id, post_id);
create index posts_published_at_idx on posts (published, published_at);
```

说明：

- `post_tags` 主键覆盖按文章查询标签。
- `post_tags_tag_id_idx` 覆盖标签页和计数。
- 标签量不大时不为统计预建物化视图；出现慢查询后再优化。

---

## 15. 测试与验收

### 15.1 数据层

- `React` 和 `react` 解析为同一标签。
- 一篇文章提交重复标签，只保留一个关联。
- 删除文章不删除标签。
- 有文章关联的标签不能删除。
- 停用标签前台不可见，后台可恢复。

### 15.2 前台

- `/tags` 只显示公开标签。
- `/tags/[slug]` 正确显示名称、描述和文章。
- 旧大小写、空格 URL 永久重定向到 canonical URL。
- 停用标签返回 404，不进入 sitemap。
- 文章卡片、详情、搜索、OG 图和分享海报显示正确标签。
- 所有标签链接使用 slug。

### 15.3 后台

- 非管理员无法调用任何标签 Server Action。
- 新建、编辑、重命名、停用、启用、删除符合规则。
- 重命名不改变 URL。
- normalized key 冲突时提示已有同名标签。
- 趋势图包含连续 12 个自然月（中国时区），草稿不计入。
- 累计阅读量标注为快照。

### 15.4 工程

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- 主要查询执行 `EXPLAIN ANALYZE`
- 迁移前后核对 `posts`、`tags`、`post_tags` 数量

---

## 16. 实施阶段

| 阶段 | 内容 | 完成标准 |
| --- | --- | --- |
| P0 | 表结构、迁移、回填、兼容双写 | 数据完整，旧代码可运行 |
| P1 | 数据访问层、前台标签页和组件改造 | 前台无回归，旧 URL 可解析 |
| P2 | 后台 CRUD、重命名、停用 | 标签可完整管理 |
| P3 | 文章编辑器标签选择 | 新文章不再产生标签变体 |
| P4 | 统计与 12 个月趋势 | 趋势和阅读量快照可查看 |
| P5 | 删除旧数组和文档同步 | 主 SPEC / README 更新完成 |

P0、P1 完成后才能切换生产；P5 最后执行。

---

## 17. 回滚策略

- 删除 `posts.tags` 前，旧代码可以继续读取旧数组。
- 新代码过渡期双写 `posts.tags`，支持代码回滚。
- `tags` 和 `post_tags` 为新增结构，回滚应用代码时无需删除。
- 数据异常时停止切读，修复回填后重新执行。
- 执行 P5 前必须备份；删除旧列后只能依赖备份或关系表重建数组。

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

---

## 19. 与主 SPEC 同步

功能实现后更新：

- `specs/spec-jiangruijians-blog.md` 的数据库设计。
- 目录结构中的 `/admin/tags` 和相关文件。
- S7 标签能力说明。
- `README.md` 的标签与后台功能说明。
- 迁移、RLS 和索引记录。

本 SPEC 评审通过前，不修改主 SPEC 和业务代码。
