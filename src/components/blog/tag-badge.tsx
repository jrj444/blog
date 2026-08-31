import Link from "next/link";
import { cn } from "@/lib/utils";

export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  return (
    <Link
      href={`/tags/${encodeURIComponent(tag)}`}
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs leading-5 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground",
        className,
      )}
    >
      #{tag}
    </Link>
  );
}
