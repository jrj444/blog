"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { tagInputSchema } from "@/lib/validators/tag";
import { normalizeManualTagSlug } from "@/lib/tags/slug";
import {
  createTag,
  deleteTagById,
  POSTS_CACHE_TAG,
  setTagActive,
  updateTagRow,
} from "@/lib/db/queries";

export type TagActionState = {
  errors?: Record<string, string[]>;
  message?: string;
  /** normalized_key 冲突时带回既有标签，表单渲染跳转链接（§7.3） */
  existingTag?: { id: string; name: string; slug: string };
} | null;

/**
 * 标签写操作统一失效（§12）：标签生命周期操作的语义是「马上不该再出现」，
 * 用 updateTag 立即过期（下一个请求阻塞等新数据）；文章保存才用 revalidateTag(…, "max")。
 */
function revalidateTagCaches() {
  updateTag(POSTS_CACHE_TAG);
  revalidatePath("/", "layout");
  revalidatePath("/admin/tags");
  revalidatePath("/admin/tags/[id]", "page");
}

function parseTagForm(formData: FormData) {
  return tagInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    isActive: formData.get("isActive") === "on",
  });
}

export async function createTagAction(
  _prev: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  if (!(await isAdmin())) return { message: "未授权" };

  const parsed = parseTagForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  let manualSlug: string | undefined;
  if (parsed.data.slug) {
    try {
      manualSlug = normalizeManualTagSlug(parsed.data.slug);
    } catch (error) {
      return { errors: { slug: [error instanceof Error ? error.message : "slug 无效"] } };
    }
  }

  const result = await createTag({
    name: parsed.data.name,
    manualSlug,
    description: parsed.data.description || null,
    isActive: parsed.data.isActive,
  });

  if (!result.ok) {
    if (result.reason === "nameConflict") {
      return {
        errors: { name: [`已存在同名标签「${result.existing.name}」`] },
        existingTag: result.existing,
      };
    }
    return { errors: { slug: [`slug「${result.slug}」已被占用，请换一个或留空自动生成`] } };
  }

  revalidateTagCaches();
  // §7.3：创建成功后跳转详情页
  redirect(`/admin/tags/${result.tag.id}`);
}

export async function updateTagAction(
  id: string,
  _prev: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  if (!(await isAdmin())) return { message: "未授权" };

  const parsed = parseTagForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const result = await updateTagRow({
    id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    isActive: parsed.data.isActive,
  });

  if (!result.ok) {
    return {
      errors: { name: [`已存在同名标签「${result.existing.name}」`] },
      existingTag: result.existing,
    };
  }

  revalidateTagCaches();
  return { message: "已保存" };
}

/** 列表行 / 详情页的快速停用 / 启用（表单直调，无需客户端组件） */
export async function toggleTagActiveAction(id: string, isActive: boolean): Promise<void> {
  if (!(await isAdmin())) return;
  await setTagActive(id, isActive);
  revalidateTagCaches();
}

/** 只有无任何关联的标签可硬删（§7.5）；有关联时返回可读错误，由调用方展示 */
export async function deleteTagAction(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "hasRelations" }> {
  if (!(await isAdmin())) return { ok: false, reason: "hasRelations" };
  const result = await deleteTagById(id);
  if (result.ok) {
    revalidateTagCaches();
  }
  return result;
}
