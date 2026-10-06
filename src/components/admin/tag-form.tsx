"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TagActionState } from "@/app/admin/tags/actions";

type TagFormProps = {
  action: (prev: TagActionState, formData: FormData) => Promise<TagActionState>;
  mode: "create" | "edit";
  defaultValues?: {
    name?: string;
    /** 仅 create 模式可填；edit 模式 slug 不可修改（§7.4），由 slugText 展示 */
    slug?: string;
    slugText?: string;
    description?: string;
    isActive?: boolean;
  };
  submitLabel?: string;
};

export function TagForm({ action, mode, defaultValues, submitLabel }: TagFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = mode === "edit";

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="space-y-2">
        <Label htmlFor="tag-name">名称</Label>
        <Input
          id="tag-name"
          name="name"
          placeholder="如 Next.js"
          defaultValue={defaultValues?.name}
          maxLength={50}
          aria-invalid={Boolean(state?.errors?.name)}
        />
        <p className="text-xs text-muted-foreground">
          不同大小写 / 全半角会归并为同一个标签；重命名不改变 slug 与现有链接。
        </p>
        {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
        {state?.existingTag && (
          <p className="text-sm text-destructive">
            已有同名标签：
            <Link
              href={`/admin/tags/${state.existingTag.id}`}
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              {state.existingTag.name}
            </Link>
            <span className="ml-1 font-mono text-xs">#{state.existingTag.slug}</span>
          </p>
        )}
      </div>

      {isEdit ? (
        <div className="space-y-2">
          <Label htmlFor="tag-slug">Slug（不可修改）</Label>
          <Input id="tag-slug" value={defaultValues?.slugText ?? ""} readOnly disabled />
          <p className="text-xs text-muted-foreground">
            slug 创建后不可修改，现有链接永远保持稳定（§7.4）。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="tag-slug">Slug（可选）</Label>
          <Input
            id="tag-slug"
            name="slug"
            placeholder="留空则按名称自动生成"
            defaultValue={defaultValues?.slug}
            aria-invalid={Boolean(state?.errors?.slug)}
          />
          <p className="text-xs text-muted-foreground">
            仅允许小写字母、数字、汉字、点和连字符；手工指定冲突会直接报错，自动生成冲突会自动加编号。
          </p>
          {state?.errors?.slug && (
            <p className="text-sm text-destructive">{state.errors.slug[0]}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tag-description">描述（可选）</Label>
        <Textarea
          id="tag-description"
          name="description"
          rows={3}
          maxLength={200}
          placeholder="显示在标签页的一句话简介"
          defaultValue={defaultValues?.description}
          aria-invalid={Boolean(state?.errors?.description)}
        />
        {state?.errors?.description && (
          <p className="text-sm text-destructive">{state.errors.description[0]}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="tag-active"
          name="isActive"
          defaultChecked={defaultValues?.isActive ?? true}
        />
        <Label htmlFor="tag-active" className="text-sm font-normal">
          启用（停用后前台隐藏，且不能被新文章选用；已有文章的关联保留）
        </Label>
      </div>

      {state?.message && (
        <p
          className={
            state.message === "已保存" ? "text-sm text-emerald-600" : "text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="gap-1.5">
          {isPending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
          {submitLabel ?? (isEdit ? "保存修改" : "创建标签")}
        </Button>
      </div>
    </form>
  );
}
