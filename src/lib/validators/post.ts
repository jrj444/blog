import { z } from "zod";

export const postInputSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(120, "标题最长120个字符"),
  slug: z
    .string()
    .min(1, "slug 不能为空")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能是小写字母、数字和连字符"),
  excerpt: z.string().max(300, "摘要最多 300 字").optional().or(z.literal("")),
  contentMd: z.string().min(1, "正文不能为空"),
  tags: z.array(z.string().trim().min(1)).max(10, "标签最多 10 个"),
  published: z.boolean().default(false),
});

export type PostInput = z.infer<typeof postInputSchema>;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
