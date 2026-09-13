import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** 允许的图片类型 → 扩展名。不含 SVG（可内联脚本，等于 XSS 风险） */
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_TYPES;

/** 单张封面大小上限（客户端压缩后一般 100–300KB，5MB 足够宽松） */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 长缓存：文件名带 UUID，内容不可变，所以可以放心 immutable */
export const CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * 注意：故意不在模块顶层校验环境变量、也不抛错。
 * `next build` 会求值这个模块，而 CI（.github/workflows/ci.yml）里没有 R2 变量，
 * 顶层抛错会直接把构建搞挂。所以惰性校验，只在真正调用时检查。
 */
function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  const missing = Object.entries({
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET: bucket,
    R2_PUBLIC_BASE_URL: publicBaseUrl,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`缺少 R2 环境变量：${missing.join(", ")}`);
  }

  return {
    bucket: bucket!,
    publicBaseUrl: publicBaseUrl!.replace(/\/+$/, ""),
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    }),
  };
}

/** 类型守门：把任意字符串收窄成 AllowedImageType */
export function isAllowedImageType(value: string): value is AllowedImageType {
  return value in ALLOWED_TYPES;
}

/** 生成对象 key：按年月分目录 + UUID 文件名，避免冲突、避免用用户提供的文件名 */
export function buildObjectKey(type: AllowedImageType, prefix = "covers"): string {
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${prefix}/${yearMonth}/${crypto.randomUUID()}.${ALLOWED_TYPES[type]}`;
}

export function publicUrlFor(key: string): string {
  return `${config().publicBaseUrl}/${key}`;
}

/** 从公开 URL 反查对象 key（删旧封面、清孤儿文件时用） */
export function keyFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = config().publicBaseUrl;
  return url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null;
}

/**
 * 签发一次性直传凭证（浏览器直接 PUT 到 R2，字节不经过 Vercel）。
 * ⚠️ 客户端 PUT 时必须带同样的 Content-Type 头，否则 R2 返回 403 SignatureDoesNotMatch。
 */
export async function createUploadTarget(options: {
  key: string;
  contentType: AllowedImageType;
  expiresInSeconds?: number;
}) {
  const { client, bucket, publicBaseUrl } = config();
  const expiresInSeconds = options.expiresInSeconds ?? 300;

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      ContentType: options.contentType,
      CacheControl: CACHE_CONTROL,
    }),
    { expiresIn: expiresInSeconds },
  );

  // ⚠️ 实测：预签名 URL 只签了 host，Content-Type / Cache-Control 不在签名里。
  // 客户端必须原样带上这两个头，否则 R2 不会写入对应元数据（封面会退化成默认 4 小时缓存）。
  return {
    uploadUrl,
    key: options.key,
    publicUrl: `${publicBaseUrl}/${options.key}`,
    expiresInSeconds,
    headers: {
      "Content-Type": options.contentType,
      "Cache-Control": CACHE_CONTROL,
    } as Record<string, string>,
  };
}

/** 删除对象（换封面 / 删文章时清理） */
export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
