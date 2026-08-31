import Link from "next/link";
import type { ReactNode } from "react";

export function Pagination({
  page,
  pageCount,
  prevHref,
  nextHref,
}: {
  page: number;
  pageCount: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
    <nav aria-label="分页" className="mt-10 flex items-center justify-between">
      <PaginationLink href={prevHref}>← 上一页</PaginationLink>
      <span className="text-sm text-muted-foreground tabular-nums">
        {page} / {pageCount}
      </span>
      <PaginationLink href={nextHref}>下一页 →</PaginationLink>
    </nav>
  );
}

function PaginationLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) {
    return (
      <span
        aria-disabled
        className="cursor-not-allowed rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground/40"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
    >
      {children}
    </Link>
  );
}
