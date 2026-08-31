"use server";

import { incrementViews } from "@/lib/db/queries";

// 阅读量:仅在浏览器真正打开文章后由 ViewTracker 调用;
// Link 预取不会触发,RLS/RPC 侧也只对已发布文章生效。
export async function trackView(postId: string) {
  await incrementViews(postId);
}
