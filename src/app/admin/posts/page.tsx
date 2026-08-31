import Link from "next/link";
import { listPosts } from "@/lib/db/queries";
import { DeletePostButton } from "@/components/admin/delete-post-button";

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">文章管理</h1>
        <Link
          href="/admin/posts/new"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          + 新建
        </Link>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">标题</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {posts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  还没有文章。
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium" title={post.title}>
                    {post.title}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        post.published
                          ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-700"
                          : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {post.published ? "已发布" : "草稿"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/posts/${post.id}`} className="text-sm text-primary">
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

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={`/admin/posts?page=${page - 1}`} className="rounded border px-3 py-1">
              上一页
            </Link>
          )}
          <span className="px-2 text-muted-foreground">
            {page} / {pageCount}
          </span>
          {hasMore && (
            <Link href={`/admin/posts?page=${page + 1}`} className="rounded border px-3 py-1">
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
