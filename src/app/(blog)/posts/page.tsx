import Link from "next/link";
import { Feather } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { listPublishedPosts } from "@/lib/db/queries";
import { PostCard } from "@/components/blog/post-card";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "文章",
  description: "全部已发布的技术文章。",
};

const PAGE_SIZE = 10;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page: pageParam } = await searchParams;
  const raw = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  const { posts, total, hasMore } = await listPublishedPosts(page, PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">文章</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {total > 0 ? `共 ${total} 篇文章` : "还没有已发布的文章"}
        </p>
      </header>

      {posts.length > 0 ? (
        <div className="mt-6 divide-y divide-border/70">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
          <Feather aria-hidden className="mb-1 size-5 text-muted-foreground/50" />
          {total === 0 ? (
            <>
              <p className="text-sm font-medium">还没有已发布的文章</p>
              <p className="text-xs text-muted-foreground">文章发布后,会第一时间出现在这里。</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">这一页没有文章</p>
              <p className="text-xs text-muted-foreground">
                试试{" "}
                <Link
                  href="/posts"
                  className="underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  回到第一页
                </Link>
                。
              </p>
            </>
          )}
        </div>
      )}

      {posts.length > 0 && (
        <nav aria-label="分页" className="mt-10 flex items-center justify-between">
          <PaginationLink href={page > 1 ? (page === 2 ? "/posts" : `/posts?page=${page - 1}`) : null}>
            ← 上一页
          </PaginationLink>
          <span className="text-sm tabular-nums text-muted-foreground">
            {page} / {pageCount}
          </span>
          <PaginationLink href={hasMore ? `/posts?page=${page + 1}` : null}>下一页 →</PaginationLink>
        </nav>
      )}
    </div>
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
