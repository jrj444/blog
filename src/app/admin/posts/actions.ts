"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/auth";
import { postInputSchema, slugify, type PostInput } from "@/lib/validators/post";
import { createPost, updatePost, deletePost } from "@/lib/db/queries";

export type PostActionState = {
  errors?: Record<string, string[]>;
  message?: string;
} | null;

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
  revalidatePath("/admin/posts");
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
  revalidatePath("/admin/posts");
  redirect("/admin/posts");
}

export async function deletePostAction(id: string) {
  if (!(await isAdmin())) return;
  await deletePost(id);
  revalidatePath("/admin/posts");
  redirect("/admin/posts");
}
