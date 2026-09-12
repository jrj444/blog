"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { isAdmin } from "@/auth";
import { postInputSchema, slugify, type PostInput } from "@/lib/validators/post";
import { createPost, updatePost, deletePost, POSTS_CACHE_TAG } from "@/lib/db/queries";

export type PostActionState = {
  errors?: Record<string, string[]>;
  message?: string;
} | null;

/**
 * 文章写操作后统一失效缓存。
 *
 * - revalidateTag(POSTS_CACHE_TAG, "max")：让前台带 tags 的 unstable_cache 数据
 *   （列表/详情/标签/统计/RSS）失效。Next 16 要求显式给出 stale 窗口，单参数形式已废弃；
 *   "max" 是官方推荐值，语义为 stale-while-revalidate（标记失效，下次访问后台刷新）。
 * - revalidatePath("/", "layout")：清空客户端路由缓存，并让整站下次访问重新验证。
 *
 * 前台各页面目前是 force-dynamic，这一步不会改变现有行为；它的作用是让
 * 「发布后前台立刻可见」成为显式保证，而不是依赖「恰好没有缓存」。
 */
function revalidatePostCaches() {
  revalidateTag(POSTS_CACHE_TAG, "max");
  revalidatePath("/", "layout");
  revalidatePath("/admin/posts");
}

// 把表单字段转成 zod 想要的结构；slug 留空则用 slugify(title)，中文标题空串时兜底
function parseForm(formData: FormData): PostInput {
  const title = String(formData.get("title") ?? "");
  const rawSlug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const slug = rawSlug || slugify(title) || `post-${Date.now().toString(36)}`;

  return {
    title,
    slug,
    excerpt: String(formData.get("excerpt") ?? ""),
    contentMd: String(formData.get("contentMd") ?? ""),
    coverImage: String(formData.get("coverImage") ?? "").trim(),
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    published: formData.get("published") === "on",
  };
}

export async function createPostAction(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  if (!(await isAdmin())) return { message: "未授权" };

  const parsed = postInputSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await createPost(parsed.data);
  revalidatePostCaches();
  redirect("/admin/posts");
}

export async function updatePostAction(
  id: string,
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  if (!(await isAdmin())) return { message: "未授权" };

  const parsed = postInputSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await updatePost(id, parsed.data);
  revalidatePostCaches();
  redirect("/admin/posts");
}

export async function deletePostAction(id: string) {
  if (!(await isAdmin())) return;
  await deletePost(id);
  revalidatePostCaches();
  redirect("/admin/posts");
}
