"use client";

import { useState, useTransition } from "react";
import { approveCommentAction, deleteCommentAction } from "@/app/admin/comments/actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CommentActionButtons({
  id,
  status,
  isRootComment,
  authorName,
}: {
  id: string;
  status: string;
  isRootComment: boolean;
  authorName: string;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isApproving, startApproveTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleApprove = () => {
    startApproveTransition(async () => {
      const res = await approveCommentAction(id);
      if (res?.success === false) {
        alert(res.message || "审核失败，请重试");
      }
    });
  };

  const handleDeleteConfirm = () => {
    startDeleteTransition(async () => {
      const res = await deleteCommentAction(id);
      if (res?.success === false) {
        alert(res.message || "删除失败，请重试");
      }
      setDeleteOpen(false);
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "pending" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isApproving || isDeleting}
          onClick={handleApprove}
          className="h-7 gap-1 px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
        >
          {isApproving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          <span>{isApproving ? "审批中..." : "通过"}</span>
        </Button>
      )}

      <button
        type="button"
        disabled={isApproving || isDeleting}
        onClick={() => setDeleteOpen(true)}
        className="text-xs font-medium text-destructive/80 transition-colors hover:text-destructive disabled:opacity-50"
      >
        删除
      </button>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next && !isDeleting) setDeleteOpen(false);
        }}
      >
        <AlertDialogContent closeDisabled={isDeleting}>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle>确认删除该评论？</AlertDialogTitle>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  评论者：{authorName}
                </p>
              </div>
            </div>
            <AlertDialogDescription className="mt-2 text-left">
              {isRootComment ? (
                <span className="font-medium text-destructive/90">
                  ⚠️ 注意：此评论为楼层主评，删除将级联清理该楼下所有跟评回复！此操作不可撤销。
                </span>
              ) : (
                "确定要永久删除这条回复吗？此操作不可撤销，该评论将从数据库中移除。"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              size="default"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
              className="gap-1.5"
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span>{isDeleting ? "正在删除..." : "确认删除"}</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
