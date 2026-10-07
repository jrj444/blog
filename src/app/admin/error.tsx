"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

/**
 * 后台错误边界（此前只有 (blog) 组有 error.tsx，/admin 出错是 Next 默认错误屏）。
 * error / reset 由 Next 注入；digest 用于在日志里定位对应的服务端错误。
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <p className="text-sm font-medium">页面出错了</p>
      <p className="text-xs text-muted-foreground">请重试；若持续出错，请记下错误标识并反馈。</p>
      {error.digest ? (
        <p className="font-mono text-[10px] text-muted-foreground">digest: {error.digest}</p>
      ) : null}
      <Button variant="outline" size="sm" onClick={reset}>
        重试
      </Button>
    </div>
  );
}
