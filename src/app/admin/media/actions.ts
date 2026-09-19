"use server";

import { z } from "zod";
import { isAdmin } from "@/auth";
import {
  listObjects,
  deleteObject,
  buildObjectKey,
  createUploadTarget,
  isAllowedImageType,
  MAX_UPLOAD_BYTES,
  type StoredMediaItemWithRefs,
} from "@/lib/storage";
import { listMediaReferences } from "@/lib/db/queries";

const uploadRequestSchema = z.object({
  type: z.string(),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, `图片大小不能超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`),
  prefix: z.enum(["covers", "posts", "media"]).default("media"),
});

/** 列取媒体库素材（按时间倒序，含引用反查数据） */
export async function listMediaAction(prefix?: string): Promise<{
  ok: boolean;
  items: StoredMediaItemWithRefs[];
  error?: string;
}> {
  if (!(await isAdmin())) {
    return { ok: false, items: [], error: "未授权" };
  }

  try {
    const [items, refMap] = await Promise.all([listObjects(prefix), listMediaReferences()]);

    const itemsWithRefs: StoredMediaItemWithRefs[] = items.map((item) => ({
      ...item,
      references: refMap[item.key] ?? [],
    }));

    return { ok: true, items: itemsWithRefs };
  } catch (err) {
    console.error("[media-action] listMediaAction failed:", err);
    return { ok: false, items: [], error: "获取素材列表失败" };
  }
}

export type UploadTargetResponse =
  | {
      ok: true;
      uploadUrl: string;
      key: string;
      publicUrl: string;
      expiresInSeconds: number;
      headers: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
    };

/** 签发媒体库直传凭证 */
export async function createMediaUploadTargetAction(input: {
  type: string;
  size: number;
  prefix?: "covers" | "posts" | "media";
}): Promise<UploadTargetResponse> {
  if (!(await isAdmin())) {
    return { ok: false, error: "未授权" };
  }

  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数不合法" };
  }
  if (!isAllowedImageType(parsed.data.type)) {
    return { ok: false, error: "只支持 JPG / PNG / WebP / AVIF 图片格式" };
  }

  try {
    const key = buildObjectKey(parsed.data.type, parsed.data.prefix ?? "media");
    const target = await createUploadTarget({ key, contentType: parsed.data.type });
    return { ok: true, ...target };
  } catch (err) {
    console.error("[media-action] createMediaUploadTargetAction failed:", err);
    return { ok: false, error: "上传服务暂时不可用，请稍后重试" };
  }
}

/** 永久删除指定存储对象 */
export async function deleteMediaItemAction(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { ok: false, error: "未授权" };
  }

  if (!key || typeof key !== "string" || key.trim() === "") {
    return { ok: false, error: "无效的对象路径" };
  }

  try {
    await deleteObject(key.trim());
    return { ok: true };
  } catch (err) {
    console.error("[media-action] deleteMediaItemAction failed:", err);
    return { ok: false, error: "删除素材失败，请稍后重试" };
  }
}
