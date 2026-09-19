import Link from "next/link";
import { ExternalLink, Eye, Feather, PenLine, Search } from "lucide-react";
import { listPosts } from "@/lib/db/queries";
import { DeletePostButton } from "@/components/admin/delete-post-button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type SearchParams = {
  page?: string | string[];
  status?: string | string[];
  q?: string | string[];
};

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { page: pageParam, status: statusParam, q: qParam } = await searchParams;

  const rawStatus = (Array.isArray(statusParam) ? statusParam[0] : statusParam)?.trim();
  const status = rawStatus === "published" || rawStatus === "draft" ? rawStatus : "all";

  const rawPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const q = (Array.isArray(qParam) ? qParam[0] : qParam)?.trim() || undefined;

  const { posts, total, counts, pageSize, hasMore } = await listPosts({
    page,
    pageSize: PAGE_SIZE,
    status,
    q,
  });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const buildHref = (overrides: { page?: number; status?: string; q?: string | null }) => {
    const params = new URLSearchParams();
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextQ = overrides.q !== undefined ? overrides.q : q;
    const nextPage = overrides.page !== undefined ? overrides.page : 1;

    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    if (nextQ) params.set("q", nextQ);
    if (nextPage > 1) params.set("page", String(nextPage));

    const query = params.toString();
    return query ? `/admin/posts?${query}` : "/admin/posts";
  };

  const tabs = [
    { key: "all", label: "全部", count: counts.all },
    { key: "published", label: "已发布", count: counts.published },
    { key: "draft", label: "草稿", count: counts.draft },
  ] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="文章管理"
        description={`共 ${counts.all} 篇文章（已发布 ${counts.published}，草稿 ${counts.draft}）。`}
        actions={
          <Link
            href="/admin/posts/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <PenLine aria-hidden className="size-4" />
            新建文章
          </Link>
        }
      />

      {/* 筛选与搜索工具栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* 状态 Tab */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
          {tabs.map((tab) => {
            const active = status === tab.key;
            return (
              <Link
                key={tab.key}
                href={buildHref({ status: tab.key, page: 1 })}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums",
                    active
                      ? "bg-muted font-semibold text-foreground"
                      : "bg-background/60 text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* 搜索框 */}
        <form action="/admin/posts" method="get" className="relative w-full sm:w-72">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜索文章标题或摘要…"
            className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
        </form>
      </div>

      {q && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            搜索「{q}」的结果，共 {total} 篇
          </span>
          <span aria-hidden>·</span>
          <Link
            href={buildHref({ q: null, page: 1 })}
            className="text-foreground underline underline-offset-4 transition-colors hover:text-primary"
          >
            清除搜索
          </Link>
        </div>
      )}

      {/* 文章表格 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-muted/35 text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
              <tr>
                <th className="px-5 py-3.5 font-medium">标题</th>
                <th className="w-24 px-5 py-3.5 font-medium">状态</th>
                <th className="w-24 px-5 py-3.5 font-medium">阅读量</th>
                <th className="w-36 px-5 py-3.5 font-medium">创建时间</th>
                <th className="w-40 px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Feather aria-hidden className="size-5 text-muted-foreground/40" />
                      {q ? (
                        <>
                          <p className="text-sm font-medium">没有找到相关文章</p>
                          <p className="text-xs">
                            换个关键词试试，或{" "}
                            <Link
                              href={buildHref({ q: null, page: 1 })}
                              className="text-foreground underline underline-offset-4 hover:text-primary"
                            >
                              清除搜索
                            </Link>
                          </p>
                        </>
                      ) : status === "draft" ? (
                        <p className="text-sm">暂无草稿文章。</p>
                      ) : status === "published" ? (
                        <p className="text-sm">暂无已发布文章。</p>
                      ) : (
                        <p className="text-sm">还没有文章，先新建一篇吧。</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id} className="transition-colors hover:bg-muted/25">
                    <td className="max-w-[480px] px-5 py-4 font-medium" title={post.title}>
                      <span className="block truncate">{post.title}</span>
                      {post.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1 font-mono text-[10.5px] text-muted-foreground">
                          {post.tags.slice(0, 3).map((t) => (
                            <span key={t}>#{t}</span>
                          ))}
                          {post.tags.length > 3 && <span>+{post.tags.length - 3}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          post.published
                            ? "inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                            : "inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        }
                      >
                        {post.published ? "已发布" : "草稿"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <Eye aria-hidden className="size-3 text-muted-foreground/60" />
                        {post.views}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                      {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-3">
                        {post.published && (
                          <Link
                            href={`/posts/${post.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="在前台新标签页预览"
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <ExternalLink aria-hidden className="size-3" />
                            <span>查看</span>
                          </Link>
                        )}
                        <Link
                          href={"/admin/posts/" + post.id}
                          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          编辑
                        </Link>
                        <DeletePostButton id={post.id} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页器 */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 ? (
            <Link
              href={buildHref({ page: page - 1 })}
              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              上一页
            </Link>
          ) : null}
          <span className="px-2 font-mono text-xs text-muted-foreground">
            {page} / {pageCount}
          </span>
          {hasMore ? (
            <Link
              href={buildHref({ page: page + 1 })}
              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              下一页
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
