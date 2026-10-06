"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { deleteTagAction } from "@/app/admin/tags/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeleteTagButtonProps = {
  id: string;
  name: string;
  /** 详情页删除成功后跳回列表 */
  redirectTo?: string;
  className?: string;
};

export function DeleteTagButton({ id, name, redirectTo, className }: DeleteTagButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteTagAction(id);
      if (!result.ok) {
        setError("该标签仍有关联文章，先移除关联或停用后再删除。");
        return;
      }
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
        }
      >
        删除
      </button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !isPending) setOpen(false);
        }}
      >
        <AlertDialogContent closeDisabled={isPending}>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>确认删除该标签？</AlertDialogTitle>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">#{name}</p>
              </div>
            </div>

            <AlertDialogDescription className="mt-2 text-left">
              仅无任何文章关联的标签可以删除，删除后不可恢复。标签的名称与 slug
              将一并移除，指向它的链接会失效。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirm}
              className="gap-1.5"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span>{isPending ? "正在删除..." : "确认删除"}</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
