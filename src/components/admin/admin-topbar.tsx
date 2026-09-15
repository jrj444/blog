"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminSidebarContent } from "./admin-sidebar";

function getSectionTitle(pathname: string) {
  if (pathname === "/admin/posts/new") return "新建文章";
  if (pathname.startsWith("/admin/posts/")) return "编辑文章";
  if (pathname.startsWith("/admin/posts")) return "文章";
  if (pathname === "/admin") return "概览";
  return "管理后台";
}

export function AdminTopbar() {
  const pathname = usePathname();
  const [mobileNavOpenPath, setMobileNavOpenPath] = useState<string | null>(null);
  const mobileNavOpen = mobileNavOpenPath === pathname;
  const sectionTitle = getSectionTitle(pathname);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            aria-label="打开后台导航"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpenPath(pathname)}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Menu aria-hidden className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-semibold">blog</span>
            <span className="text-muted-foreground/60" aria-hidden>
              /
            </span>
            <span className="truncate text-muted-foreground">{sectionTitle}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 pr-3 sm:pr-6">
          <ThemeToggle />
          <Link
            href="/"
            className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            查看站点
            <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭后台导航"
            onClick={() => setMobileNavOpenPath(null)}
            className="absolute inset-0 bg-black/30 dark:bg-black/60"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="后台导航"
            className="absolute inset-y-0 left-0 flex w-[272px] max-w-[86vw] border-r border-border bg-card shadow-2xl"
          >
            <AdminSidebarContent
              pathname={pathname}
              onNavigate={() => setMobileNavOpenPath(null)}
            />
            <button
              type="button"
              aria-label="关闭后台导航"
              onClick={() => setMobileNavOpenPath(null)}
              className="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </button>
          </aside>
        </div>
      ) : null}
    </>
  );
}
