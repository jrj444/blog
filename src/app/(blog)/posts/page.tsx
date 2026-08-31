import Link from "next/link";
import { Feather, Search } from "lucide-react";
import type { Metadata } from "next";
import { listPublishedPosts } from "@/lib/db/queries";
import { PostCard } from "@/components/blog/post-card";
import { Pagination } from "@/components/blog/pagination";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "文章",
  description: "全部已发布的技术文章。",
};

const PAGE_SIZE = 10;

type SearchParams = {
  page?: string | string[];
  q?: string | string[];
};

export default async function PostsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { page: pageParam, q: qParam } = await searchParams;

  const rawPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const q = (Array.isArray(qParam) ? qParam[0] : qParam)?.trim() || undefined;

  const { posts, total, hasMore } = await listPublishedPosts({ page, pageSize: PAGE_SIZE, q });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 分页/回到第一页的链接都要保留搜索词。
  const buildPageHref = (p: number) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/posts?${query}` : "/posts";
  };

  return (
    <div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">文章</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {q ? null : total > 0 ? `共 ${total} 篇文章` : "还没有已发布的文章"}
        </p>
      </header>

      <form action="/posts" role="search" className="mt-6">
        <div className="relative max-w-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/70"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜索文章标题或内容…"
            className="h-10 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
        </div>
      </form>

      {q && (
        <p className="mt-3 text-sm text-muted-foreground">
          搜索「{q}」的结果,共 {total} 篇 ·{" "}
          <Link
            href="/posts"
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            清除搜索
          </Link>
        </p>
      )}

      {posts.length > 0 ? (
        <div className="mt-6 divide-y divide-border/70">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
          <Feather aria-hidden className="mb-1 size-5 text-muted-foreground/50" />
          {q && total === 0 ? (
            <>
              <p className="text-sm font-medium">没有找到相关文章</p>
              <p className="text-xs text-muted-foreground">
                换几个关键词试试,或{" "}
                <Link
                  href="/posts"
                  className="underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  清除搜索
                </Link>
                。
              </p>
            </>
          ) : total === 0 ? (
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
                  href={buildPageHref(1)}
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
        <Pagination
          page={page}
          pageCount={pageCount}
          prevHref={page > 1 ? buildPageHref(page - 1) : null}
          nextHref={hasMore ? buildPageHref(page + 1) : null}
        />
      )}
    </div>
  );
}
