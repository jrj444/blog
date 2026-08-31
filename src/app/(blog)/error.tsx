"use client";

import { useEffect } from "react";
import Link from "next/link";

// 前台页面运行时错误兜底(如数据库瞬时故障)。
// 注意:Next 16 中恢复函数 prop 名为 retry,不是旧版的 reset。
export default function BlogError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">500</p>
      <h1 className="text-2xl font-bold tracking-tight">出了点问题</h1>
      <p className="text-sm text-muted-foreground">
        页面加载失败,可能是网络波动或服务暂时不可用。
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          重试
        </button>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          回到首页
        </Link>
      </div>
    </div>
  );
}
