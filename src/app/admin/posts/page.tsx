import Link from "next/link";
import { PenLine } from "lucide-react";
import { listPosts } from "@/lib/db/queries";
import { DeletePostButton } from "@/components/admin/delete-post-button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

const PAGE_SIZE = 10;

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { posts, total, pageSize, hasMore } = await listPosts(page, PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="文章管理"
        description={"共 " + total + " 篇文章，管理发布状态与历史内容。"}
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

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-muted/35 text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
              <tr>
                <th className="px-5 py-3.5 font-medium">标题</th>
                <th className="w-28 px-5 py-3.5 font-medium">状态</th>
                <th className="w-40 px-5 py-3.5 font-medium">创建时间</th>
                <th className="w-32 px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-muted-foreground">
                    还没有文章。
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id} className="transition-colors hover:bg-muted/25">
                    <td className="max-w-[560px] px-5 py-4 font-medium" title={post.title}>
                      <span className="block truncate">{post.title}</span>
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
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-3">
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

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 ? (
            <Link
              href={"/admin/posts?page=" + (page - 1)}
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
              href={"/admin/posts?page=" + (page + 1)}
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
