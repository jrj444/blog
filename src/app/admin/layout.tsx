import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 真正的鉴权在这里（proxy 只是乐观跳转）
  if (!(await isAdmin())) {
    redirect("/auth/signin?redirectTo=/admin");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="font-semibold">{"jiangruijian's blog Admin"}</span>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/admin">仪表盘</Link>
            <Link href="/admin/posts">文章</Link>
            <Link href="/">回前台</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
