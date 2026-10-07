import Link from "next/link";
import type { PostListItem } from "@/lib/db/queries";
import { TagBadge } from "@/components/blog/tag-badge";
import { toDatetimeLocal } from "@/lib/format-date";

/** 日期块按 Asia/Shanghai 切分（服务器在 UTC，直接 getMonth/getDate 会错一天） */
function dateParts(date: Date | string) {
  const local = toDatetimeLocal(date);
  return {
    day: local.slice(8, 10),
    my: `${local.slice(5, 7)} / ${local.slice(0, 4)}`,
  };
}

/**
 * 列表卡片。只接收列表投影（PostListItem），不带正文全文——
 * 字数/阅读时长由 SQL 侧算好，避免列表页搬运整篇 content_md。
 */
export function PostCard({ post }: { post: PostListItem }) {
  const { day, my } = dateParts(post.publishedAt ?? post.createdAt);
  const { charCount, readingMinutes } = post;

  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-2 py-6 sm:grid-cols-[auto_1fr_auto_auto] sm:py-7"
    >
      {/* 日期块 */}
      <div className="flex items-baseline gap-2 pt-0.5 font-mono text-muted-foreground sm:w-20 sm:flex-col sm:items-start sm:gap-0">
        <span className="font-serif text-[26px] leading-none font-semibold text-foreground tabular-nums">
          {day}
        </span>
        <span className="text-[10.5px] tracking-[0.13em]">{my}</span>
      </div>

      {/* 正文 */}
      <div className="min-w-0">
        {post.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} asSpan />
            ))}
          </div>
        )}
        <h2 className="font-serif text-lg leading-snug font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.excerpt}
          </p>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          <span>{readingMinutes} MIN READ</span>
          <span aria-hidden className="size-[3px] rounded-full bg-border" />
          <span>{charCount.toLocaleString()} 字</span>
          <span aria-hidden className="size-[3px] rounded-full bg-border" />
          <span>{post.views} 阅读</span>
        </p>
      </div>

      {/* 封面缩略图：桌面端显示，保持列表紧凑；移动端只在文章页看封面 */}
      {post.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverImage}
          alt=""
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
          className="hidden aspect-video w-40 self-center rounded-md border border-border object-cover sm:block"
        />
      ) : null}

      {/* 箭头 */}
      <span
        aria-hidden
        className="hidden -translate-x-1 self-center pl-4 text-lg text-muted-foreground opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
      >
        →
      </span>
    </Link>
  );
}
