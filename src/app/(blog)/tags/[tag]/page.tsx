import Link from "next/link";
import { Feather } from "lucide-react";
import type { Metadata } from "next";
import { listPublishedPosts } from "@/lib/db/queries";
import { PostCard } from "@/components/blog/post-card";
import { Pagination } from "@/components/blog/pagination";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type Props = {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  return {
    title: `#${tag}`,
    description: `标签「${tag}」下的全部文章。`,
  };
}

export default async function TagPage({ params, searchParams }: Props) {
  const { tag } = await params;
  const { page: pageParam } = await searchParams;
  const raw = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  const { posts, total, hasMore } = await listPublishedPosts({ page, pageSize: PAGE_SIZE, tag });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tagPath = `/tags/${encodeURIComponent(tag)}`;
  const buildPageHref = (p: number) => (p > 1 ? `${tagPath}?page=${p}` : tagPath);

  return (
    <div>
      <header>
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          标签
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight break-words">#{tag}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {total > 0 ? `共 ${total} 篇文章` : "该标签下还没有文章"}
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
              <p className="text-sm font-medium">该标签下还没有文章</p>
              <p className="text-xs text-muted-foreground">
                去看看{" "}
                <Link
                  href="/posts"
                  className="underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  全部文章
                </Link>
                。
              </p>
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
