import { cn } from "@/lib/utils";

export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs leading-5 text-muted-foreground",
        className,
      )}
    >
      #{tag}
    </span>
  );
}
