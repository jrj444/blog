"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import {
  countRecentCommentsByIpHash,
  getApprovedCommentTarget,
  getPublishedPostContentBySlug,
  incrementViews,
  insertPendingComment,
  togglePostLike,
} from "@/lib/db/queries";
import { toDatetimeLocal } from "@/lib/format-date";
import { commentInputSchema } from "@/lib/validators/comment.ts";
import { getClientIp, hashClientIdentity } from "@/lib/rate-limit.ts";

const VIEW_COOKIE = "vw";
/** 单日最多记 40 篇（约 1.5KB，防超 cookie 上限） */
const MAX_TRACKED_PER_DAY = 40;

// 阅读量:仅在浏览器真正打开文章后由 ViewTracker 调用;
// Link 预取不会触发,RLS/RPC 侧也只对已发布文章生效。
// 服务端按 httpOnly cookie 做按天去重——此前唯一防线是客户端 sessionStorage，
// 刷新页面或简单脚本即可刷量。定位是防误刷，不是防定向攻击（那需要 IP 库）。
export async function trackView(postId: string) {
  // 非法输入静默忽略：此前会让 increment_post_views 的 uuid cast 抛未处理异常
  if (!z.uuid().safeParse(postId).success) return;

  const store = await cookies();
  const today = toDatetimeLocal(new Date()).slice(0, 10).replace(/-/g, "");
  const [day, list = ""] = (store.get(VIEW_COOKIE)?.value ?? "").split("|");
  const viewed = new Set(day === today ? list.split(",").filter(Boolean) : []);
  if (viewed.has(postId)) return;

  await incrementViews(postId);

  viewed.add(postId);
  store.set(VIEW_COOKIE, `${today}|${[...viewed].slice(-MAX_TRACKED_PER_DAY).join(",")}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 36,
  });
}

/**
 * 复制按钮的惰性取文：正文是公开数据（仅已发布），无需鉴权；
 * 避免详情页把整篇 Markdown 源文作为 prop 再传一份进 RSC payload。
 */
export async function getPostContentBySlug(slug: string): Promise<string | null> {
  if (!slug || slug.length > 200) return null;
  return getPublishedPostContentBySlug(slug);
}

const LIKE_COOKIE = "lk_visitor";

export async function toggleLikeAction(postId: string) {
  if (!z.string().uuid().safeParse(postId).success) {
    throw new Error("Invalid post ID");
  }
  const store = await cookies();
  let visitorId = store.get(LIKE_COOKIE)?.value;

  if (!visitorId || !z.string().uuid().safeParse(visitorId).success) {
    visitorId = crypto.randomUUID();
    store.set(LIKE_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 年
    });
  }

  return togglePostLike(postId, visitorId);
}

export type CommentActionState = {
  success?: boolean;
  message?: string;
  error?: Record<string, string[]>;
} | null;

/**
 * 提交评论
 * @param _prev
 * @param formData
 */
export async function addCommentAction(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const rawData = {
    postId: String(formData.get("postId") ?? ""),
    authorName: String(formData.get("authorName") ?? ""),
    authorUrl: String(formData.get("authorUrl") ?? "").trim(),
    content: String(formData.get("content") ?? ""),
    parentId: formData.get("parentId") ? String(formData.get("parentId")) : null,
    replyToId: formData.get("replyToId") ? String(formData.get("replyToId")) : null,
    website: String(formData.get("website") ?? ""),
  };

  if (rawData.website && rawData.website.trim() !== "") {
    return { success: true, message: "评论已提交，博主审核通过后显示" };
  }

  const parsed = commentInputSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.flatten().fieldErrors,
    };
  }

  const { postId, authorName, authorUrl, content, parentId, replyToId } = parsed.data;

  const h = await headers();
  const clientIp = getClientIp(h);
  const userAgent = h.get("user-agent") ?? "unknown";
  const ipHash = hashClientIdentity(clientIp, userAgent);

  const recentCount = await countRecentCommentsByIpHash(ipHash, 10);
  if (recentCount >= 3) {
    return {
      success: false,
      message: "评论太频繁，请稍后再试",
    };
  }

  if (parentId) {
    const parentComment = await getApprovedCommentTarget(parentId);
    // 根评论必须存在、同文章、已通过、且自身必须是顶级（parentId IS NULL）
    if (!parentComment || parentComment.postId !== postId || parentComment.parentId !== null) {
      return { success: false, message: "回复的目标楼层无效或未通过审核" };
    }
  }

  if (replyToId) {
    const replyTarget = await getApprovedCommentTarget(replyToId);
    // 回复的具体目标必须存在且同文章
    if (!replyTarget || replyTarget.postId !== postId) {
      return { success: false, message: "回复的目标发言无效" };
    }
  }

  await insertPendingComment({
    postId,
    authorName,
    authorUrl,
    content,
    parentId,
    replyToId,
    ipHash,
  });

  return {
    success: true,
    message: "评论已提交，请等待审核通过后显示",
  };
}
