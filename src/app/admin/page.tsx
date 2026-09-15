import Link from "next/link";
import { ExternalLink, FilePlus, PenLine, Rss } from "lucide-react";
import { getDashboardStats, listRecentPosts, listTagsWithCountsUncached } from "@/lib/db/queries";
import { formatDate } from "@/lib/format-date";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

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
    { label: "今年发布", value: stats.thisYear, hint: new Date().getFullYear() + " 年" },
    { label: "总阅读量", value: stats.views, hint: "累计" },
  ];

  const quickLinks = [
    { href: "/admin/posts", label: "文章管理", icon: FilePlus },
    { href: "/admin/posts/new", label: "新建文章", icon: PenLine },
    { href: "/", label: "查看站点", icon: ExternalLink },
    { href: "/feed.xml", label: "RSS", icon: Rss },
  ];

  return (
    <div className="space-y-7">
      <AdminPageHeader
        title="仪表盘"
        description="查看站点内容状态、最近更新与标签分布。"
        actions={
          <Link
            href="/admin/posts/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <FilePlus aria-hidden className="size-4" />
            新建文章
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="内容统计">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground/15 sm:p-5"
          >
            <p className="text-[10.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
              {card.label}
            </p>
            <p className="mt-3 font-serif text-3xl font-bold tabular-nums">{card.value}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-[10.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
          快捷操作
        </h2>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">最近更新</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">最近编辑或发布的文章</p>
            </div>
            <Link
              href="/admin/posts"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              全部文章 →
            </Link>
          </div>
          <ul className="divide-y divide-border/70">
            {recent.length === 0 ? (
              <li className="px-5 py-12 text-center text-sm text-muted-foreground">
                还没有文章，先新建一篇吧。
              </li>
            ) : (
              recent.map((post) => (
                <li key={post.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(post.updatedAt)} · {post.views} 阅读
                    </p>
                  </div>
                  <span
                    className={
                      post.published
                        ? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                        : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    }
                  >
                    {post.published ? "已发布" : "草稿"}
                  </span>
                  <Link
                    href={"/admin/posts/" + post.id}
                    className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    编辑
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">标签分布</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">当前文章使用的全部标签</p>
          </div>
          <div className="flex min-h-[148px] flex-wrap content-start gap-2 p-5">
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无标签。</p>
            ) : (
              tags.map(({ tag, count }) => (
                <Link
                  key={tag}
                  href={"/tags/" + encodeURIComponent(tag)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/35 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <span>#{tag}</span>
                  <span className="rounded-full bg-background px-1.5 text-[10px] tabular-nums">
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
