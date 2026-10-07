import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <p className="text-sm font-medium">页面不存在</p>
      <p className="text-xs text-muted-foreground">内容可能已被删除，或链接有误。</p>
      <Link
        href="/admin"
        className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        返回概览
      </Link>
    </div>
  );
}
