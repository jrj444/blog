"use client";

import { useState } from "react";
import Link from "next/link";
import { Feather } from "lucide-react";
import type { Post } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { PostCard } from "./post-card";

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-accent-2 bg-accent text-accent-foreground"
      : "border-border text-muted-foreground hover:border-accent-2 hover:text-accent-2",
  );

export function HomeFeed({
  posts,
  hasMore,
  allTags,
}: {
  posts: Post[];
  hasMore: boolean;
  allTags: string[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const filtered = active ? posts.filter((p) => p.tags.includes(active)) : posts;

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

      {allTags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActive(null)} className={chip(active === null)}>
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActive(active === tag ? null : tag)}
              className={chip(active === tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 divide-y divide-border/70">
        {filtered.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
            <Feather aria-hidden className="mb-1 size-5 text-muted-foreground/50" />
            <p className="text-sm font-medium">没有匹配的文章</p>
            <p className="text-xs text-muted-foreground">换个标签试试,或清除筛选。</p>
          </div>
        ) : (
          filtered.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </section>
  );
}
