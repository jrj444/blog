import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { PostSibling } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

type Props = {
  prev: PostSibling;
  next: PostSibling;
  className?: string;
};

export function PostNavigation({ prev, next, className }: Props) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="文章翻页导航"
      className={cn("mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2", className)}
    >
      {prev ? (
        <Link
          href={`/posts/${prev.slug}`}
          className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-sm"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase transition-colors group-hover:text-primary">
            <ArrowLeft
              aria-hidden
              className="size-3.5 transition-transform group-hover:-translate-x-0.5"
            />
            上一篇
          </span>
          <span className="mt-2.5 line-clamp-2 font-serif text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div aria-hidden className="hidden sm:block" />
      )}

      {next ? (
        <Link
          href={`/posts/${next.slug}`}
          className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-sm sm:text-right"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase transition-colors group-hover:text-primary sm:justify-end">
            下一篇
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </span>
          <span className="mt-2.5 line-clamp-2 font-serif text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
