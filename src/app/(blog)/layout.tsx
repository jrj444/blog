import Link from "next/link";
import { isAdmin } from "@/auth";
import { NavLinks } from "@/components/blog/nav-links";

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  // 仅管理员可见「管理后台」入口;auth() 读 cookie,本布局因此为动态渲染
  const showAdmin = await isAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded bg-foreground font-mono text-[11px] font-bold text-background"
            >
              j
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              {"jiangruijian's blog"}
            </span>
          </Link>
          <NavLinks showAdmin={showAdmin} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {"jiangruijian's blog"}</span>
          <span>用 Next.js 与 Drizzle 搭建 · 记录与思考</span>
        </div>
      </footer>
    </div>
  );
}
