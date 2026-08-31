"use client";

import { deletePostAction } from "@/app/admin/posts/actions";

export function DeletePostButton({ id }: { id: string }) {
  return (
    <form action={deletePostAction.bind(null, id)}>
      <button
        type="submit"
        className="text-sm text-destructive"
        onClick={(e) => {
          if (!window.confirm("确定要删除这篇文章吗？此操作不可撤销。")) {
            e.preventDefault();
          }
        }}
      >
        删除
      </button>
    </form>
  );
}