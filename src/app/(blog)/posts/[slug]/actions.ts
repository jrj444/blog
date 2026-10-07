"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getPublishedPostContentBySlug, incrementViews } from "@/lib/db/queries";
import { toDatetimeLocal } from "@/lib/format-date";

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
