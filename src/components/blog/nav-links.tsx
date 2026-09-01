"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/posts", label: "Archive" },
  { href: "/tags", label: "Tags" },
] as const;

export function NavLinks({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: readonly { href: string; label: string }[] = [
    ...NAV_ITEMS,
    ...(showAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (active: boolean) =>
    cn(
      "relative py-1 text-sm transition-colors",
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  const underline = (active: boolean) =>
    cn(
      "absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent-2 transition-transform duration-200",
      active ? "scale-x-100" : "scale-x-0",
    );

  return (
    <div className="flex items-center gap-2">
      {/* 桌面导航 */}
      <nav className="hidden items-center gap-6 md:flex">
        {items.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              {label}
              <span className={underline(active)} aria-hidden />
            </Link>
          );
        })}
      </nav>

      {/* 移动端折叠按钮 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "关闭菜单" : "打开菜单"}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {/* 移动端下拉 */}
      {open && (
        <nav className="absolute inset-x-0 top-full border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md md:hidden">
          <ul className="flex flex-col gap-1">
            {items.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
