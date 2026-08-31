"use client";

import { useActionState, useRef, useState } from "react";
import { PostEditor } from "./post-editor";
import type { PostActionState } from "@/app/admin/posts/actions";

type Props = {
  action: (prev: PostActionState, formData: FormData) => Promise<PostActionState>;
  defaultValues?: {
    title?: string;
    slug?: string;
    excerpt?: string;
    contentMd?: string;
    tags?: string[];
    published?: boolean;
  };
};

export function PostForm({ action, defaultValues }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [markdown, setMarkdown] = useState(defaultValues?.contentMd ?? "");
  const contentRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        // React 19 不会把受控 value 同步到 <input type="hidden">，
        // 所以在提交前一刻直接写 DOM，确保 Server Action 里 formData.get("contentMd") 能拿到正文。
        if (contentRef.current) {
          contentRef.current.value = markdown;
        }
      }}
      className="space-y-4"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">标题</label>
        <input
          name="title"
          placeholder="文章标题"
          defaultValue={defaultValues?.title}
          className="w-full rounded border px-3 py-2"
        />
        {state?.errors?.title && (
          <p className="text-sm text-destructive">{state.errors.title[0]}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Slug</label>
        <input
          name="slug"
          placeholder="留空则按标题生成"
          defaultValue={defaultValues?.slug}
          className="w-full rounded border px-3 py-2"
        />
        {state?.errors?.slug && <p className="text-sm text-destructive">{state.errors.slug[0]}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">摘要</label>
        <textarea
          name="excerpt"
          placeholder="一句话摘要，可选"
          defaultValue={defaultValues?.excerpt}
          className="w-full rounded border px-3 py-2"
          rows={3}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">标签（逗号分隔）</label>
        <input
          name="tags"
          placeholder="多个标签用逗号分隔"
          defaultValue={(defaultValues?.tags ?? []).join(",")}
          className="w-full rounded border px-3 py-2"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={defaultValues?.published} />
        发布（不勾选则存为草稿）
      </label>

      <PostEditor
        markdown={markdown}
        onMarkdownChange={setMarkdown}
        placeholder="在这里输入正文，支持 Markdown 语法…"
      />
      <input type="hidden" name="contentMd" ref={contentRef} />
      {state?.errors?.contentMd && (
        <p className="text-sm text-destructive">{state.errors.contentMd[0]}</p>
      )}

      {state?.message && <p className="text-sm text-destructive">{state.message}</p>}

      <button type="submit" className="rounded bg-primary px-4 py-2 text-primary-foreground">
        保存
      </button>
    </form>
  );
}
