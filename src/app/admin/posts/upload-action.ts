"use server";

import { z } from "zod";
import { isAdmin } from "@/auth";
import {
  MAX_UPLOAD_BYTES,
  buildObjectKey,
  createUploadTarget,
  deleteObject,
  isAllowedImageType,
  keyFromPublicUrl,
} from "@/lib/storage";

/**
 * 直传模式下服务端看不到字节，这里只能校验客户端「声明」的类型和大小。
 * 真正的字节校验要等上传后用 HEAD 复核，或挂 Worker。
 */
const requestSchema = z.object({
  type: z.string(),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, `图片不能超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`),
  prefix: z.enum(["covers", "posts"]).optional(),
});

export type CreateCoverUploadResult =
  | {
      ok: true;
      uploadUrl: string;
      publicUrl: string;
      key: string;
      expiresInSeconds: number;
      /** 客户端 PUT 时必须原样带上的请求头（Content-Type + Cache-Control） */
      headers: Record<string, string>;
    }
  | { ok: false; error: string };

/** 签发一次性直传凭证（浏览器拿到后直接 PUT 到 R2） */
export async function createCoverUploadAction(input: {
  type: string;
  size: number;
  prefix?: "covers" | "posts";
}): Promise<CreateCoverUploadResult> {
  // 安全边界：必须是管理员
  if (!(await isAdmin())) return { ok: false, error: "未授权" };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "参数不合法" };
  }
  if (!isAllowedImageType(parsed.data.type)) {
    return { ok: false, error: "只支持 JPG / PNG / WebP / AVIF" };
  }

  try {
    const key = buildObjectKey(parsed.data.type, parsed.data.prefix ?? "covers");
    const target = await createUploadTarget({ key, contentType: parsed.data.type });
    return { ok: true, ...target };
  } catch (error) {
    // 细节只进服务端日志（Vercel → Logs 可查），不回传给客户端，避免泄漏桶名/凭证信息
    console.error("[cover-upload] 签发上传凭证失败", error);
    return { ok: false, error: "上传服务暂时不可用，请稍后重试" };
  }
}

/** 删除已上传的封面对象（换图 / 删文章时清理用） */
export async function deleteCoverObjectAction(
  publicUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin())) return { ok: false, error: "未授权" };

  const key = keyFromPublicUrl(publicUrl);
  // 只删本站存储的对象：手填的外链不能去删（也不该删）
  if (!key) return { ok: false, error: "不是本站存储的图片，已跳过删除" };

  try {
    await deleteObject(key);
    return { ok: true };
  } catch (error) {
    console.error("[cover-upload] 删除对象失败", error);
    return { ok: false, error: "删除失败，请稍后重试" };
  }
}
