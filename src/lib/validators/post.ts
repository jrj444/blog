import { z } from "zod";

/**
 * 文章表单的标签条目（spec §8.2）：{ id } = 已有标签，{ name } = 待创建名称。
 * zod 默认剥离未知键：同时带 id 和 name 的条目按 id 处理。
 * 去重以 normalized_key 为准（服务端做），这里只约束形状与数量。
 */
export const postTagInputSchema = z.union([
  z.object({ id: z.uuid() }),
  z.object({
    name: z.string().trim().min(1, "标签名不能为空").max(50, "标签名最长 50 个字符"),
  }),
]);

export const postInputSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(120, "标题最长120个字符"),
  slug: z
    .string()
    .min(1, "slug 不能为空")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能是小写字母、数字和连字符"),
  excerpt: z.string().max(300, "摘要最多 300 字").optional().or(z.literal("")),
  contentMd: z.string().min(1, "正文不能为空"),
  tags: z.array(postTagInputSchema).max(10, "标签最多 10 个"),
  published: z.boolean().default(false),
  // 发布时间（§5.3）：parseForm 已按 Asia/Shanghai 转成 Date。
  // undefined = 表单没有这个字段（过渡期），null = 显式留空（草稿存 NULL，发布由服务端填 now()）。
  publishedAt: z.date().nullable().optional(),
  // 封面图：可留空；填了必须是有效 URL
  coverImage: z
    .string()
    .max(500, "封面图地址过长")
    .url("封面图需是有效的 URL")
    .optional()
    .or(z.literal("")),
});

export type PostTagInput = z.infer<typeof postTagInputSchema>;
export type PostInput = z.infer<typeof postInputSchema>;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
