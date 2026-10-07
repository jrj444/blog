"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { isAdmin } from "@/auth";
import { postInputSchema, slugify, type PostInput, type PostTagInput } from "@/lib/validators/post";
import {
  createPost,
  updatePost,
  deletePost,
  getPostContentById,
  TagWriteError,
  POSTS_CACHE_TAG,
} from "@/lib/db/queries";
import { isUuid } from "@/lib/utils";

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

/** parseForm 的字段级解析错误（tags JSON 损坏、publishedAt 格式非法等），转成表单字段错误 */
class FormParseError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

/**
 * datetime-local 提交的是无时区字符串（YYYY-MM-DDTHH:mm[:ss]），必须按 Asia/Shanghai
 * 解析成 timestamptz——不能 new Date(str) 裸解析，那会按服务器/UTC 解释产生 8 小时偏移
 * （spec §5.3）。上海无夏令时，固定 +08:00 即可。
 */
const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function parsePublishedAt(formData: FormData): Date | null | undefined {
  const raw = formData.get("publishedAt");
  if (raw === null) return undefined; // 表单还没有该字段（过渡期，§8.2）
  const value = String(raw).trim();
  if (value === "") return null; // 显式留空：草稿存 NULL，发布由服务端填 now()
  if (!DATETIME_LOCAL_RE.test(value)) {
    throw new FormParseError("publishedAt", "发布时间格式不正确");
  }
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}+08:00`);
  if (Number.isNaN(date.getTime())) {
    throw new FormParseError("publishedAt", "发布时间无效");
  }
  return date;
}

/**
 * 标签隐藏字段（§8.2）：标签选择组件提交 JSON 数组（元素形如 {id} / {name}）。
 * 结构合法性交给 zod；解析失败给字段级错误，不得静默丢弃标签。
 * （P5：旧逗号输入框的兼容分支已随旧标签数组列一并移除。）
 */
function parseTags(formData: FormData): PostTagInput[] {
  const raw = String(formData.get("tags") ?? "").trim();
  if (raw === "") return [];
  if (!raw.startsWith("[")) {
    throw new FormParseError("tags", "标签数据格式错误，请重新编辑标签");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FormParseError("tags", "标签数据格式错误，请重新编辑标签");
  }
  if (!Array.isArray(parsed)) {
    throw new FormParseError("tags", "标签数据格式错误，请重新编辑标签");
  }
  return parsed as PostTagInput[];
}

// 把表单字段转成 zod 想要的结构；slug 留空则用 slugify(title)，中文标题空串时兜底
function parseForm(formData: FormData): PostInput {
  const title = String(formData.get("title") ?? "");
  const rawSlug = String(formData.get("slug") ?? "").trim();
  // 手工 slug 与标题生成的 slug 都走 slugify 归一（Unicode），归一后为空再用时间戳兜底
  const slug = slugify(rawSlug) || slugify(title) || `post-${Date.now().toString(36)}`;

  return {
    title,
    slug,
    excerpt: String(formData.get("excerpt") ?? ""),
    contentMd: String(formData.get("contentMd") ?? ""),
    coverImage: String(formData.get("coverImage") ?? "").trim(),
    tags: parseTags(formData),
    publishedAt: parsePublishedAt(formData),
    // 底部两个提交按钮分别带 intent=draft / intent=publish（回车隐式提交时取第一个按钮，即草稿）
    published: formData.get("intent") === "publish",
  };
}

function toActionError(error: unknown): PostActionState {
  if (error instanceof FormParseError) {
    return { errors: { [error.field]: [error.message] } };
  }
  if (error instanceof TagWriteError) {
    return { errors: { tags: [error.message] } };
  }
  return null;
}

export async function createPostAction(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  if (!(await isAdmin())) return { message: "未授权" };

  try {
    const parsed = postInputSchema.safeParse(parseForm(formData));
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }
    await createPost(parsed.data);
  } catch (error) {
    const actionError = toActionError(error);
    if (actionError) return actionError;
    throw error;
  }
  revalidatePostCaches();
  redirect("/admin/posts");
}

export async function updatePostAction(
  id: string,
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  if (!(await isAdmin())) return { message: "未授权" };

  try {
    const parsed = postInputSchema.safeParse(parseForm(formData));
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors };
    }
    await updatePost(id, parsed.data);
  } catch (error) {
    const actionError = toActionError(error);
    if (actionError) return actionError;
    throw error;
  }
  revalidatePostCaches();
  redirect("/admin/posts");
}

/**
 * 后台复制按钮的惰性取文：列表不再把整篇 contentMd 塞进 RSC payload，
 * 点击复制时才取（isAdmin + UUID 校验）。null = 未授权或文章不存在。
 */
export async function getPostContentAction(id: string): Promise<string | null> {
  if (!(await isAdmin())) return null;
  if (!isUuid(id)) return null;
  return getPostContentById(id);
}

export async function deletePostAction(id: string) {
  if (!(await isAdmin())) return;
  await deletePost(id);
  revalidatePostCaches();
  redirect("/admin/posts");
}
