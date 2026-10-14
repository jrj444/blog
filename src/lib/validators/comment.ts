import { z } from "zod";

/**
 * 评论提交表单校验
 */
export const commentInputSchema = z.object({
  postId: z.string().uuid("文章 ID 无效"),
  authorName: z.string().trim().min(1, "请输入昵称").max(30, "昵称不能超过 30 个字符"),
  authorUrl: z
    .string()
    .trim()
    .max(200, "主页链接过长")
    .refine((val) => !val || /^https?:\/\//i.test(val), "主页链接必须以 http:// 或 https:// 开头")
    .optional()
    .or(z.literal("")),
  content: z.string().trim().min(1, "请输入评论内容").max(1000, "评论内容不能超过 1000 个字符"),
  parentId: z.string().uuid("父评论 ID 无效").optional().nullable(),
  replyToId: z.string().uuid("回复目标 ID 无效").optional().nullable(),
  website: z.string().optional(),
});

export type CommentInput = z.infer<typeof commentInputSchema>;
