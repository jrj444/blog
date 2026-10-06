import { z } from "zod";

/**
 * 后台标签表单（§7.3/§7.4）：可编辑 name / description / is_active。
 * slug 仅创建时可填（可空 = 自动生成）；编辑模式下不提交该字段。
 */
export const tagInputSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(50, "名称最长 50 个字符"),
  slug: z.string().trim().max(60, "slug 最长 60 个字符").optional().or(z.literal("")),
  description: z.string().trim().max(200, "描述最长 200 个字符").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export type TagInput = z.infer<typeof tagInputSchema>;
