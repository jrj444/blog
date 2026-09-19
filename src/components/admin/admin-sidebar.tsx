"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, FileText, ImageIcon, LayoutDashboard, PenLine, Rss } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

const WORKSPACE_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "概览",
    icon: LayoutDashboard,
    isActive: (pathname) => pathname === "/admin",
  },
  {
    href: "/admin/posts",
    label: "文章",
    icon: FileText,
    isActive: (pathname) =>
      pathname === "/admin/posts" ||
      (pathname.startsWith("/admin/posts/") && !pathname.startsWith("/admin/posts/new")),
  },
  {
    href: "/admin/media",
    label: "媒体库",
    icon: ImageIcon,
    isActive: (pathname) => pathname.startsWith("/admin/media"),
  },
  {
    href: "/admin/posts/new",
    label: "新建文章",
    icon: PenLine,
    isActive: (pathname) => pathname === "/admin/posts/new",
  },
];

const SITE_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "查看前台",
    icon: ExternalLink,
    isActive: () => false,
  },
  {
    href: "/feed.xml",
    label: "RSS Feed",
    icon: Rss,
    isActive: () => false,
  },
];

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = item.isActive(pathname);
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-colors",
            active ? "text-foreground" : "text-muted-foreground/80 group-hover:text-foreground",
          )}
        />
        <span className="truncate">{item.label}</span>
        {active ? <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden /> : null}
      </Link>
    </li>
  );
}

export function AdminSidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-[11px] font-semibold text-background">
            JR
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Jiang Ruijian</span>
            <span className="block truncate text-[10.5px] text-muted-foreground">blog admin</span>
          </span>
        </Link>
        <span className="ml-auto rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Admin
        </span>
      </div>

      <nav className="px-3 py-4" aria-label="后台导航">
        <p className="px-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          工作区
        </p>
        <ul className="mt-2 space-y-1">
          {WORKSPACE_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      <div className="mt-auto border-t border-border p-3">
        <p className="px-2 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          站点
        </p>
        <ul className="mt-2 space-y-1">
          {SITE_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
            JR
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">Jiang Ruijian</span>
            <span className="block truncate text-[10.5px] text-muted-foreground">管理员</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-border bg-card lg:flex">
      <AdminSidebarContent pathname={pathname} />
    </aside>
  );
}
