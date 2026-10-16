import Link from "next/link";
import { CornerDownRight, ExternalLink, MessageSquare } from "lucide-react";
import { listAdminComments, getAdminCommentKpis } from "@/lib/db/queries";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CommentActionButtons } from "@/components/admin/comment-action-buttons";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type SearchParams = {
  page?: string | string[];
  status?: string | string[];
};

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { page: pageParam, status: statusParam } = await searchParams;

  const rawStatus = (Array.isArray(statusParam) ? statusParam[0] : statusParam)?.trim();
  const status = rawStatus === "pending" || rawStatus === "approved" ? rawStatus : "all";

  const rawPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  // 1. 并行拉取 KPI 与分页列表
  const [kpis, { rows: comments, totalPages }] = await Promise.all([
    getAdminCommentKpis(),
    listAdminComments({
      status: status === "all" ? undefined : status,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);

  const totalCount = kpis.pending + kpis.approved;

  const buildHref = (overrides: { page?: number; status?: string }) => {
    const params = new URLSearchParams();
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextPage = overrides.page !== undefined ? overrides.page : 1;

    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", String(nextPage));

    const query = params.toString();
    return query ? `/admin/comments?${query}` : "/admin/comments";
  };

  const tabs = [
    { key: "all", label: "全部", count: totalCount },
    { key: "pending", label: "待审核", count: kpis.pending, isPending: true },
    { key: "approved", label: "已通过", count: kpis.approved },
  ] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="评论管理"
        description={`共 ${totalCount} 条评论（待审核 ${kpis.pending} 条，已放行 ${kpis.approved} 条）。`}
      />

      {/* 状态筛选 Tab */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
        {tabs.map((tab) => {
          const active = status === tab.key;
          const hasPendingBadge = tab.key === "pending" && tab.count > 0;
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
                  hasPendingBadge
                    ? "bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300"
                    : active
                      ? "bg-muted font-medium text-foreground"
                      : "bg-background/60 text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* 评论表格 */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="border-b border-border bg-muted/35 text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
              <tr>
                <th className="w-48 px-5 py-3.5 font-medium">所属文章与层级</th>
                <th className="w-40 px-5 py-3.5 font-medium">评论者</th>
                <th className="px-5 py-3.5 font-medium">评论内容</th>
                <th className="w-24 px-5 py-3.5 font-medium">状态</th>
                <th className="w-28 px-5 py-3.5 font-medium">提交时间</th>
                <th className="w-28 px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {comments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <MessageSquare aria-hidden className="size-5 text-muted-foreground/40" />
                      {status === "pending" ? (
                        <p className="text-sm">太棒了，当前没有待审核的评论。</p>
                      ) : status === "approved" ? (
                        <p className="text-sm">暂无已放行的评论。</p>
                      ) : (
                        <p className="text-sm">暂无任何评论数据。</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                comments.map((comment) => (
                  <tr key={comment.id} className="transition-colors hover:bg-muted/25">
                    {/* 所属文章与层级 */}
                    <td className="max-w-[200px] px-5 py-4">
                      <Link
                        href={`/posts/${comment.postSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
                        title={comment.postTitle}
                      >
                        <span className="truncate text-xs">{comment.postTitle}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-40 group-hover:opacity-100" />
                      </Link>
                      <div className="mt-1">
                        {comment.parentId ? (
                          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <CornerDownRight className="size-2.5" />
                            回复 @{comment.replyToAuthorName || comment.parentAuthorName || "访客"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            主楼评论
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 评论者信息 */}
                    <td className="max-w-[160px] px-5 py-4">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-xs font-medium text-foreground">
                          {comment.authorName}
                        </span>
                        {comment.authorUrl && (
                          <a
                            href={comment.authorUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow ugc"
                            title={comment.authorUrl}
                            className="text-muted-foreground transition-colors hover:text-primary"
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <div
                        className="mt-1 font-mono text-[10px] text-muted-foreground/70"
                        title={`IP HMAC: ${comment.ipHash}`}
                      >
                        IP: {comment.ipHash.slice(0, 8)}
                      </div>
                    </td>

                    {/* 评论内容（纯文本安全展示，防止 XSS） */}
                    <td className="max-w-[360px] px-5 py-4">
                      <p className="line-clamp-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                        {comment.content}
                      </p>
                    </td>

                    {/* 状态徽章 */}
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          comment.status === "pending"
                            ? "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {comment.status === "pending" ? "待审核" : "已通过"}
                      </span>
                    </td>

                    {/* 提交时间 */}
                    <td className="px-5 py-4 font-mono text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateShort(comment.createdAt)}
                    </td>

                    {/* 操作按钮组 */}
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <CommentActionButtons
                        id={comment.id}
                        status={comment.status}
                        isRootComment={!comment.parentId}
                        authorName={comment.authorName}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页器 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref({ page: page - 1 })}>上一页</Link>
            </Button>
          ) : null}
          <span className="px-2 font-mono text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildHref({ page: page + 1 })}>下一页</Link>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
