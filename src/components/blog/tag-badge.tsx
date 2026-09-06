import Link from "next/link";
import { cn } from "@/lib/utils";

type TagBadgeProps = {
  tag: string;
  className?: string;
  /** 在 <a>/<Link> 内部使用时传入，渲染为 <span>，避免 <a> 嵌套 <a> 触发 hydration 错误 */
  asSpan?: boolean;
};

export function TagBadge({ tag, className, asSpan = false }: TagBadgeProps) {
  // 作为 span 渲染时去掉 hover 交互样式：它在 Link 内部，本身不可独立点击
  const classes = cn(
    "inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs leading-5 text-muted-foreground",
    !asSpan && "transition-colors hover:border-foreground/25 hover:text-foreground",
    className,
  );

  if (asSpan) {
    return <span className={classes}>#{tag}</span>;
  }

  return (
    <Link href={`/tags/${encodeURIComponent(tag)}`} className={classes}>
      #{tag}
    </Link>
  );
}