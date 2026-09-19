import Link from "next/link";
import { ExternalLink, Eye, FilePlus, Flame, PenLine, Rss } from "lucide-react";
import {
  getDashboardStats,
  listRecentPosts,
  listTopViewedPosts,
  listTagsWithCountsUncached,
} from "@/lib/db/queries";
import { formatDate } from "@/lib/format-date";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [stats, recent, topPosts, tags] = await Promise.all([
    getDashboardStats(),
    listRecentPosts(5),
    listTopViewedPosts(5),
    listTagsWithCountsUncached(),
  ]);

  const cards = [
    {
      label: "已发布",
      value: stats.published,
      hint: "公开可见",
      href: "/admin/posts?status=published",
    },
    {
      label: "草稿",
      value: stats.drafts,
      hint: "待整理",
      href: "/admin/posts?status=draft",
    },
    {
      label: "今年发布",
      value: stats.thisYear,
      hint: new Date().getFullYear() + " 年",
      href: "/admin/posts",
    },
    {
      label: "总阅读量",
      value: stats.views,
      hint: "累计总人次",
      href: "/admin/posts",
    },
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
        description="查看站点内容状态、最近更新、热门阅读与标签分布。"
        actions={
          <Button asChild>
            <Link href="/admin/posts/new">
              <FilePlus aria-hidden className="size-4" />
              新建文章
            </Link>
          </Button>
        }
      />

      {/* KPI 卡片 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="内容统计">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-5"
          >
            <p className="text-[10.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase transition-colors group-hover:text-primary">
              {card.label}
            </p>
            <p className="mt-3 font-serif text-3xl font-bold text-foreground tabular-nums transition-colors group-hover:text-primary">
              {card.value}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">{card.hint} →</p>
          </Link>
        ))}
      </section>

      {/* 快捷操作 */}
      <section>
        <h2 className="mb-3 text-[10.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
          快捷操作
        </h2>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Button key={href} variant="outline" asChild>
              <Link href={href}>
                <Icon aria-hidden className="size-4 text-muted-foreground" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </section>

      {/* 三列看板 */}
      <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* 最近更新 */}
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
              全部 →
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
                    <p className="truncate text-sm font-medium" title={post.title}>
                      {post.title}
                    </p>
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

        {/* 热门阅读 Top 5 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Flame aria-hidden className="size-4 text-orange-500" />
                热门阅读 Top 5
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">阅读量最高的文章排行</p>
            </div>
          </div>
          <ul className="divide-y divide-border/70">
            {topPosts.length === 0 ? (
              <li className="px-5 py-12 text-center text-sm text-muted-foreground">
                暂无已发布文章数据。
              </li>
            ) : (
              topPosts.map((post, idx) => (
                <li key={post.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span
                    className={
                      "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold " +
                      (idx === 0
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : idx === 1
                          ? "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                          : idx === 2
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                            : "bg-muted text-muted-foreground")
                    }
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={post.title}>
                      {post.title}
                    </p>
                    <p className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Eye aria-hidden className="size-3" />
                      <span>{post.views} 阅读</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/posts/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="前台预览"
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ExternalLink aria-hidden className="size-3.5" />
                    </Link>
                    <Link
                      href={"/admin/posts/" + post.id}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      编辑
                    </Link>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* 标签分布 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2 xl:col-span-1">
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
