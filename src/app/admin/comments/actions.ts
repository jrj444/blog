"use server";

import { approveCommentById, deleteCommentById } from "@/lib/db/queries";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/auth";

export type AdminCommentActionState = {
  success?: boolean;
  message?: string;
} | null;

/**
 * 审核通过评论（spec §7）
 */
export async function approveCommentAction(id: string): Promise<AdminCommentActionState> {
  // 1. 严格权限校验：未登录博主直接拒绝
  if (!(await isAdmin())) {
    return { success: false, message: "未授权操作" };
  }
  // 2. 数据库状态流转（pending -> approved）并取回所属文章 slug
  const result = await approveCommentById(id);
  if (!result) {
    return { success: false, message: "评论不存在或已通过审核" };
  }
  // 3. 缓存即时失效：后台列表 + 前台对应文章页同时刷新
  revalidatePath("/admin/comments");
  if (result.postSlug) {
    revalidatePath(`/posts/${result.postSlug}`);
  }
  return { success: true };
}

/**
 * 删除评论（若是顶级评论级联删除整楼，spec §7）
 */
export async function deleteCommentAction(id: string): Promise<AdminCommentActionState> {
  // 1. 严格权限校验
  if (!(await isAdmin())) {
    return { success: false, message: "未授权操作" };
  }
  // 2. 数据库物理删除并取回所属文章 slug
  const result = await deleteCommentById(id);
  if (!result) {
    return { success: false, message: "评论不存在或已被删除" };
  }
  // 3. 缓存即时失效
  revalidatePath("/admin/comments");
  if (result.postSlug) {
    revalidatePath(`/posts/${result.postSlug}`);
  }
  return { success: true };
}
