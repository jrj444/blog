/** 压缩前允许的最大原图（防止用户选个几十 MB 的图把浏览器内存吃满） */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

/** 逐档尝试：先 1600/0.82，压不下来再降质量、降尺寸 */
const COMPRESS_STEPS = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1600, quality: 0.68 },
  { maxEdge: 1280, quality: 0.75 },
  { maxEdge: 1024, quality: 0.75 },
];

/** 压到这个体积就停手 */
const TARGET_BYTES = 450 * 1024;

/**
 * 浏览器端图片压缩：逐档转 WebP，直到体积达标或用完档位。
 * 取不到更小的结果（浏览器不支持 WebP 编码 / 解码失败）就回退原图，不阻断上传。
 * 开发环境会打印 `[image-compress]` 开头的日志，方便确认每一档的实际产出。
 */
export async function compressImage(file: File): Promise<File> {
  const log = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") console.log("[image-compress]", ...args);
  };

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return file;

    log("原图", {
      name: file.name,
      type: file.type,
      sizeKB: Math.round(file.size / 1024),
      width: bitmap.width,
      height: bitmap.height,
    });

    let best: Blob | null = null;

    for (const step of COMPRESS_STEPS) {
      const scale = Math.min(1, step.maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", step.quality),
      );
      if (!blob) {
        log("toBlob 返回空，跳过该档", step);
        continue;
      }

      log("候选", {
        ...step,
        width,
        height,
        type: blob.type,
        sizeKB: Math.round(blob.size / 1024),
      });

      // 少数浏览器不支持 WebP 编码，会悄悄回退成 PNG（体积通常更大）——直接忽略
      if (blob.type !== "image/webp") continue;

      if (!best || blob.size < best.size) best = blob;
      if (best.size <= TARGET_BYTES) break;
    }

    bitmap.close();

    if (!best) {
      log("没有可用的 WebP 结果，保留原图");
      return file;
    }
    if (best.size >= file.size) {
      log("压缩结果反而更大，保留原图", {
        bestKB: Math.round(best.size / 1024),
        originalKB: Math.round(file.size / 1024),
      });
      return file;
    }

    log("采用压缩结果", {
      sizeKB: Math.round(best.size / 1024),
      originalKB: Math.round(file.size / 1024),
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([best], `${baseName}.webp`, { type: "image/webp" });
  } catch (error) {
    log("压缩失败，保留原图", error);
    return file;
  }
}
