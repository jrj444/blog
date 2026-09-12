import Link from "next/link";
import { FilePlus, ExternalLink, Rss, PenLine } from "lucide-react";
import { getDashboardStats, listRecentPosts, listTagsWithCountsUncached } from "@/lib/db/queries";
import { formatDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [stats, recent, tags] = await Promise.all([
    getDashboardStats(),
    listRecentPosts(5),
    listTagsWithCountsUncached(),
  ]);

  const cards = [
    { label: "已发布", value: stats.published, hint: "公开可见" },
    { label: "草稿", value: stats.drafts, hint: "待整理" },
    { label: "今年发布", value: stats.thisYear, hint: `${new Date().getFullYear()} 年` },
    { label: "总阅读量", value: stats.views, hint: "累计" },
  ];

  const quickLinks = [
    { href: "/admin/posts", label: "文章管理", icon: FilePlus },
    { href: "/admin/posts/new", label: "新建文章", icon: PenLine },
    { href: "/", label: "查看站点", icon: ExternalLink },
    { href: "/feed.xml", label: "RSS", icon: Rss },
  ];

  return (
    <div className="space-y-8">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <FilePlus className="size-4" />
          新建文章
        </Link>
      </div>

      {/* KPI 卡片 */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-muted/40 p-5">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              {card.label}
            </p>
            <p className="mt-2 font-serif text-3xl font-bold tabular-nums">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </section>

      {/* 快捷操作 */}
      <section>
        <h2 className="mb-3 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          快捷操作
        </h2>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* 两列:最近更新 + 标签分布 */}
      <section className="grid gap-8 lg:grid-cols-2">
        {/* 最近更新 */}
        <div>
          <h2 className="mb-3 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            最近更新
          </h2>
          <ul className="divide-y divide-border/70 rounded-lg border border-border">
            {recent.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                还没有文章,先新建一篇吧。
              </li>
            ) : (
              recent.map((post) => (
                <li key={post.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(post.updatedAt)} · {post.views} 阅读
                    </p>
                  </div>
                  <span
                    className={
                      post.published
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-700"
                        : "rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {post.published ? "已发布" : "草稿"}
                  </span>
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="shrink-0 text-sm text-primary hover:underline"
                  >
                    编辑
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* 标签分布 */}
        <div>
          <h2 className="mb-3 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            标签分布
          </h2>
          <div className="flex min-h-[120px] flex-wrap content-start gap-2 rounded-lg border border-border p-4">
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无标签。</p>
            ) : (
              tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={`/tags/${encodeURIComponent(tag)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  <span>#{tag}</span>
                  <span className="rounded-full bg-border/60 px-1.5 text-[10px] tabular-nums">
                    {count}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
