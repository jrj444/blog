import Link from "next/link";
import { Feather } from "lucide-react";
import type { Metadata } from "next";
import { listTagsWithCounts } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tags",
  description: "Browse posts by tag.",
};

export default async function TagsPage() {
  const tags = await listTagsWithCounts();
  const maxCount = Math.max(1, ...tags.map((t) => t.count));

  return (
    <div>
      <header>
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          标签
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight">Tags</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tags.length > 0 ? `共 ${tags.length} 个标签` : "还没有标签"}
        </p>
      </header>

      {tags.length > 0 ? (
        <div className="mt-8 flex flex-wrap gap-2.5">
          {tags.map(({ tag, count }) => {
            const big = count >= maxCount;
            return (
              <Link
                key={tag}
                href={`/tags/${encodeURIComponent(tag)}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border text-muted-foreground transition-colors hover:border-accent-2 hover:text-accent-2",
                  big ? "px-5 py-2 text-base" : "px-3.5 py-1.5 text-sm",
                )}
              >
                <span>#{tag}</span>
                <i className="font-mono text-[10.5px] text-muted-foreground not-italic">{count}</i>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
          <Feather aria-hidden className="mb-1 size-5 text-muted-foreground/50" />
          <p className="text-sm font-medium">还没有标签</p>
          <p className="text-xs text-muted-foreground">发布文章时添加标签,会出现在这里。</p>
        </div>
      )}
    </div>
  );
}
