import Link from "next/link";
import type { Post } from "@/lib/db/schema";
import { formatDate } from "@/lib/format-date";
import { TagBadge } from "@/components/blog/tag-badge";

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="group py-6 sm:py-7">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-6">
        <time
          dateTime={post.createdAt.toISOString()}
          className="shrink-0 text-xs tabular-nums text-muted-foreground sm:w-24 sm:text-[13px]"
        >
          {formatDate(post.createdAt, { month: "long", day: "numeric" })}
        </time>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug tracking-tight sm:text-lg">
            <Link
              href={`/posts/${post.slug}`}
              className="text-foreground underline-offset-4 decoration-border transition-colors group-hover:underline group-hover:decoration-foreground/50"
            >
              {post.title}
            </Link>
          </h2>
          {post.excerpt && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {post.excerpt}
            </p>
          )}
          {post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
