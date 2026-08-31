import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold tracking-tight">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的内容可能已被移动或删除。</p>
      <Link
        href="/"
        className="mt-3 text-sm underline underline-offset-4 transition-colors hover:text-foreground"
      >
        回到首页
      </Link>
    </div>
  );
}
