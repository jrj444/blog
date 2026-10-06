import Link from "next/link";
import { Feather } from "lucide-react";
import type { PostListItem, TagSummaryWithCount } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { PostCard } from "./post-card";

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-primary/40 bg-accent text-accent-foreground"
      : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
  );

type HomeFeedProps = {
  posts: PostListItem[];
  hasMore: boolean;
  /** 标签 chips 来源改为独立查询（§11.1）：公开标签按已发布文章数排序，不再依赖当前页文章 */
  tags: TagSummaryWithCount[];
};

export function HomeFeed({ posts, hasMore, tags }: HomeFeedProps) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-[21px] font-bold tracking-tight">全部文章</h2>
        {hasMore && (
          <Link
            href="/posts"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            全部文章 →
          </Link>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {/* All 按钮：链接到首页本身（无 tag 筛选） */}
          <Link href="/" className={chip(false)}>
            All
          </Link>
          {tags.map((tag) => (
            // 点击标签跳转到全量标签页，避免只过滤当前页的 N 篇
            <Link
              key={tag.id}
              href={`/tags/${encodeURIComponent(tag.slug)}`}
              className={chip(false)}
            >
              #{tag.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-2 divide-y divide-border/70">
        {posts.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
            <Feather aria-hidden className="mb-1 size-5 text-muted-foreground/50" />
            <p className="text-sm font-medium">没有文章</p>
            <p className="text-xs text-muted-foreground">文章发布后，会第一时间出现在这里。</p>
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </section>
  );
}
