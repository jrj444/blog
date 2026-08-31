"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/posts", label: "文章" },
  { href: "/about", label: "关于" },
] as const;

export function NavLinks({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();

  const items: readonly { href: string; label: string }[] = [
    ...NAV_ITEMS,
    ...(showAdmin ? [{ href: "/admin", label: "管理后台" }] : []),
  ];

  return (
    <nav className="flex items-center gap-1">
      {items.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
