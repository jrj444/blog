"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { deletePostAction } from "@/app/admin/posts/actions";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeletePostButton({ id, title }: { id: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      await deletePostAction(id);
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
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
                <AlertDialogTitle>确认删除该文章？</AlertDialogTitle>
                {title ? (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    《{title}》
                  </p>
                ) : null}
              </div>
            </div>

            <AlertDialogDescription className="mt-2 text-left">
              确定要永久删除这篇文章吗？此操作不可撤销，文章及关联数据将从数据库中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              size="default"
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
