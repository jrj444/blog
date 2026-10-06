import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAdminTagById, listTagMonthlyTrend, listTagUsageStats } from "@/lib/db/queries";
import { toDatetimeLocal } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DeleteTagButton } from "@/components/admin/delete-tag-button";
import { TagForm } from "@/components/admin/tag-form";
import { toggleTagActiveAction, updateTagAction } from "../actions";

type Props = {
  params: Promise<{ id: string }>;
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-serif text-2xl font-bold tabular-nums">{value}</dd>
      {hint ? <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** 12 个月趋势条形图（服务端渲染，无图表库）；月份连续、缺失补零（§10） */
function TrendChart({ points }: { points: { month: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="近 12 个月新增已发布文章趋势">
      {points.map((point) => (
        <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {point.count > 0 ? point.count : ""}
          </span>
          <div className="flex h-24 w-full items-end">
            <div
              className={cn(
                "w-full rounded-t-sm transition-colors",
                point.count > 0 ? "bg-primary/70 hover:bg-primary" : "bg-muted",
              )}
              style={{ height: `${Math.max((point.count / max) * 100, point.count > 0 ? 8 : 3)}%` }}
              title={`${point.month}：${point.count} 篇`}
            />
          </div>
          <span className="font-mono text-[9.5px] text-muted-foreground tabular-nums">
            {point.month.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminTagDetailPage({ params }: Props) {
  const { id } = await params;
  const tag = await getAdminTagById(id);
  if (!tag) notFound();

  // 后台统计与趋势不缓存（§12）：管理员需要看到刚改完的数据
  const [stats, trend] = await Promise.all([listTagUsageStats(id), listTagMonthlyTrend(id)]);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/tags"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        返回标签列表
      </Link>

      <AdminPageHeader
        title={`#${tag.name}`}
        description={`/${tag.slug} · 创建于 ${toDatetimeLocal(tag.createdAt).slice(0, 10)}`}
        actions={
          <div className="flex items-center gap-3">
            <form action={toggleTagActiveAction.bind(null, tag.id, !tag.isActive)}>
              <button
                type="submit"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {tag.isActive ? "停用" : "启用"}
              </button>
            </form>
            {stats.totalRelations === 0 ? (
              <DeleteTagButton id={tag.id} name={tag.name} redirectTo="/admin/tags" />
            ) : (
              <span
                className="cursor-not-allowed text-xs text-muted-foreground/50"
                title="有关联的标签不能删除，可改为停用"
              >
                删除
              </span>
            )}
          </div>
        }
      />

      {/* 使用统计（§10）：阅读量为当前快照 */}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="已发布文章数" value={stats.publishedCount} />
        <Stat label="草稿关联数" value={stats.draftCount} />
        <Stat label="累计阅读量" value={stats.totalViews} hint="当前快照，非月度趋势" />
        <Stat
          label="最近使用"
          value={stats.lastUsedAt ? toDatetimeLocal(stats.lastUsedAt).slice(0, 10) : "—"}
          hint="已发布文章的最新发布时间"
        />
      </dl>

      {/* 12 个月趋势（§10，Asia/Shanghai 分月，缺失补零） */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">近 12 个月新增文章</h2>
          <p className="text-xs text-muted-foreground">按发布时间（北京时间）分月</p>
        </div>
        <div className="mt-5">
          <TrendChart points={trend} />
        </div>
      </section>

      {/* 编辑（§7.4）：name / description / is_active 可改，slug 不可改 */}
      <section className="max-w-2xl space-y-3">
        <h2 className="text-sm font-semibold">编辑标签</h2>
        <TagForm
          action={updateTagAction.bind(null, tag.id)}
          mode="edit"
          submitLabel="保存修改"
          defaultValues={{
            name: tag.name,
            slugText: tag.slug,
            description: tag.description ?? "",
            isActive: tag.isActive,
          }}
        />
      </section>
    </div>
  );
}
