"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { PostEditor } from "./post-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PostActionState } from "@/app/admin/posts/actions";
import { createCoverUploadAction } from "@/app/admin/posts/upload-action";
import { compressImage, MAX_SOURCE_BYTES } from "@/lib/compress-image";

type Props = {
  action: (prev: PostActionState, formData: FormData) => Promise<PostActionState>;
  defaultValues?: {
    title?: string;
    slug?: string;
    excerpt?: string;
    contentMd?: string;
    coverImage?: string;
    tags?: string[];
    published?: boolean;
  };
};

export function PostForm({ action, defaultValues }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [markdown, setMarkdown] = useState(defaultValues?.contentMd ?? "");
  const contentRef = useRef<HTMLInputElement>(null);
  const [coverUrl, setCoverUrl] = useState(defaultValues?.coverImage ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function uploadCoverFile(file: File) {
    // 客户端先快速拦一遍（服务端还会再校验，不能只靠这里）
    if (!file.type.startsWith("image/")) {
      setUploadError("请选择图片文件");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setUploadError(`原图不能超过 ${MAX_SOURCE_BYTES / 1024 / 1024}MB`);
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      // 0) 先在浏览器里压一遍：长边 ≤1600、转 WebP（3MB 的截图通常能压到 200–400KB）
      const upload = await compressImage(file);
      if (upload.size > 5 * 1024 * 1024) {
        setUploadError("压缩后仍然超过 5MB，请换一张小一些的图片");
        return;
      }

      // 1) 找服务端要一次性上传凭证
      const target = await createCoverUploadAction({ type: upload.type, size: upload.size });
      if (!target.ok) {
        setUploadError(target.error);
        return;
      }

      // 2) 直接 PUT 到 R2（字节不经过 Vercel）
      const response = await fetch(target.uploadUrl, {
        method: "PUT",
        // 服务端下发的头（Content-Type + Cache-Control），必须原样带上：
        // Content-Type 决定元数据类型，Cache-Control 决定 CDN 缓存一年（immutable）
        headers: target.headers,
        body: upload,
      });

      if (!response.ok) {
        setUploadError(`上传失败（HTTP ${response.status}），请重试`);
        return;
      }

      // 3) 把公开 URL 写进受控值
      setCoverUrl(target.publicUrl);
    } catch {
      setUploadError("网络异常，请重试");
    } finally {
      setUploading(false);
    }
  }

  function openFilePicker() {
    if (uploading) return;
    fileInputRef.current?.click();
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 允许连续选择同一个文件
    if (file) void uploadCoverFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadCoverFile(file);
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        // React 19 不会把受控 value 同步到 <input type="hidden">，
        // 所以在提交前一刻直接写 DOM，确保 Server Action 拿得到正文与封面地址。
        if (contentRef.current) {
          contentRef.current.value = markdown;
        }
        if (coverRef.current) {
          coverRef.current.value = coverUrl;
        }
      }}
      className="space-y-6 pb-16"
    >
      {/* 基本信息 */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="border-b border-border pb-3">
          <h2 className="text-sm font-semibold">基本信息</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">标题、摘要、Slug 与文章标签。</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="post-title">标题</Label>
          <Input
            id="post-title"
            name="title"
            placeholder="文章标题"
            defaultValue={defaultValues?.title}
            aria-invalid={Boolean(state?.errors?.title)}
          />
          {state?.errors?.title && (
            <p className="text-sm text-destructive">{state.errors.title[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-slug">Slug</Label>
          <Input
            id="post-slug"
            name="slug"
            placeholder="留空则按标题生成"
            defaultValue={defaultValues?.slug}
            aria-invalid={Boolean(state?.errors?.slug)}
          />
          {state?.errors?.slug && (
            <p className="text-sm text-destructive">{state.errors.slug[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-excerpt">摘要</Label>
          <Textarea
            id="post-excerpt"
            name="excerpt"
            placeholder="一句话摘要，可选"
            defaultValue={defaultValues?.excerpt}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-tags">标签（逗号分隔）</Label>
          <Input
            id="post-tags"
            name="tags"
            placeholder="多个标签用逗号分隔"
            defaultValue={(defaultValues?.tags ?? []).join(",")}
          />
        </div>
      </section>

      {/* 封面图 */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">封面图</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setUrlInputOpen((open) => !open)}
          >
            {urlInputOpen ? "收起外链" : "或粘贴外链"}
          </Button>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
            Boolean(state?.errors?.coverImage) && "border-destructive",
          )}
        >
          {coverUrl ? (
            <>
              {/* 后台预览用原生 img：不走 Vercel 图片优化，也不需要 remotePatterns 白名单 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="封面预览" className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/75 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={openFilePicker}
                  disabled={uploading}
                >
                  更换
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCoverUrl("")}
                  disabled={uploading}
                >
                  移除
                </Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={openFilePicker}
              disabled={uploading}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <ImagePlus aria-hidden className="size-7" />
              <span className="text-sm">拖入图片，或点击选择</span>
              <span className="text-xs">JPG / PNG / WebP / AVIF · 自动压缩到 1600px WebP</span>
            </button>
          )}

          {uploading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
              <LoaderCircle aria-hidden className="size-5 animate-spin" />
              <span className="text-sm text-muted-foreground">压缩并上传中…</span>
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={handleFileInputChange}
          className="sr-only"
        />

        {urlInputOpen ? (
          <div className="space-y-2">
            <Input
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              inputMode="url"
              placeholder="https://example.com/cover.png"
              aria-invalid={Boolean(state?.errors?.coverImage)}
            />
            <p className="text-xs text-muted-foreground">
              粘贴外链会覆盖上面的上传结果；留空表示不使用封面。
            </p>
          </div>
        ) : null}

        {/* 真正提交给 Server Action 的值；上面的输入框故意不写 name，否则会提交两次 */}
        <input type="hidden" name="coverImage" ref={coverRef} />

        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        {state?.errors?.coverImage && (
          <p className="text-sm text-destructive">{state.errors.coverImage[0]}</p>
        )}
      </section>

      {/* 正文 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">正文</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            支持 Markdown、代码块、表格与图片。
          </p>
        </div>
        <PostEditor
          markdown={markdown}
          onMarkdownChange={setMarkdown}
          placeholder="在这里输入正文，支持 Markdown 语法…"
        />
        <input type="hidden" name="contentMd" ref={contentRef} />
        {state?.errors?.contentMd && (
          <p className="text-sm text-destructive">{state.errors.contentMd[0]}</p>
        )}
      </section>

      {state?.message && <p className="text-sm text-destructive">{state.message}</p>}

      {/* 底部操作条：吸底；用 name="intent" 区分「保存为草稿」与「发布」 */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="text-xs text-muted-foreground">
          {defaultValues?.published ? "当前状态：已发布" : "当前状态：草稿"}
        </p>
        <div className="flex items-center gap-2">
          <Button type="submit" name="intent" value="draft" variant="outline" disabled={uploading}>
            保存为草稿
          </Button>
          <Button type="submit" name="intent" value="publish" disabled={uploading}>
            发布
          </Button>
        </div>
      </div>
    </form>
  );
}
