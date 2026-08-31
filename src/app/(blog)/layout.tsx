import Link from "next/link";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="font-semibold">
            {"jiangruijian's blog"}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/posts">文章</Link>
            <Link href="/about">关于</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {"jiangruijian's blog"}
        </div>
      </footer>
    </div>
  );
}
