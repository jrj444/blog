import Link from "next/link";
import { Tags } from "lucide-react";
import { getAdminTagKpis, listAdminTags } from "@/lib/db/queries";
import { formatDateShort } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { toggleTagActiveAction } from "./actions";
import { DeleteTagButton } from "@/components/admin/delete-tag-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUSES = [
  { value: "all", label: "全部" },
  { value: "active", label: "启用" },
  { value: "inactive", label: "停用" },
  { value: "unused", label: "未使用" },
] as const;

const SORTS = [
  { value: "posts", label: "按文章数" },
  { value: "createdAt", label: "按创建时间" },
  { value: "updatedAt", label: "按更新时间" },
] as const;

type Props = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    sort?: string | string[];
  }>;
};

function pick(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref(params: { q?: string; status: string; sort: string }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status !== "all") search.set("status", params.status);
  if (params.sort !== "posts") search.set("sort", params.sort);
  const query = search.toString();
  return query ? `/admin/tags?${query}` : "/admin/tags";
}

export default async function AdminTagsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = pick(sp.q)?.trim() || "";
  const status = (pick(sp.status) ?? "all") as (typeof STATUSES)[number]["value"];
  const sort = (pick(sp.sort) ?? "posts") as (typeof SORTS)[number]["value"];

  const [rows, kpis] = await Promise.all([
    listAdminTags({ q: q || undefined, status, sort }),
    getAdminTagKpis(),
  ]);

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs transition-colors",
      active
        ? "border-primary/40 bg-accent text-accent-foreground"
        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
    );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="标签"
        description="管理名称、描述与启用状态。slug 创建后不可修改；删除仅对无关联的标签开放。"
        actions={
          <Button asChild>
            <Link href="/admin/tags/new">
              <Tags aria-hidden className="size-4" />
              新建标签
            </Link>
          </Button>
        }
      />

      {/* KPI（§7.2） */}
      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <dt className="text-xs text-muted-foreground">总标签数</dt>
          <dd className="mt-1 font-serif text-3xl font-bold tabular-nums">{kpis.total}</dd>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <dt className="text-xs text-muted-foreground">未使用标签数</dt>
          <dd className="mt-1 font-serif text-3xl font-bold tabular-nums">{kpis.unused}</dd>
        </div>
      </dl>

      {/* 搜索 + 状态筛选 + 排序（§7.2） */}
      <div className="flex flex-col gap-3">
        <form action="/admin/tags" className="flex max-w-md gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          {sort !== "posts" && <input type="hidden" name="sort" value={sort} />}
          <Input name="q" defaultValue={q} placeholder="搜索名称、slug 或描述" />
          <Button type="submit" variant="outline">
            搜索
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((item) => (
              <Link
                key={item.value}
                href={buildHref({ q, status: item.value, sort })}
                className={chip(status === item.value)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">排序</span>
            {SORTS.map((item) => (
              <Link
                key={item.value}
                href={buildHref({ q, status, sort: item.value })}
                className={cn(
                  "text-xs transition-colors",
                  sort === item.value
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 列表 */}
      {rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-sm font-medium">没有匹配的标签</p>
          <p className="text-xs text-muted-foreground">换个关键词，或新建一个标签。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">标签</th>
                  <th className="px-5 py-3 font-medium">已发布</th>
                  <th className="px-5 py-3 font-medium">总关联</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">最近使用</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tag) => (
                  <tr
                    key={tag.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/25"
                  >
                    <td className="max-w-[360px] px-5 py-4">
                      <Link
                        href={`/admin/tags/${tag.id}`}
                        className="font-medium transition-colors hover:text-primary"
                      >
                        #{tag.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        /{tag.slug}
                      </span>
                      {tag.description && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {tag.description}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums">
                      {tag.publishedCount}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums">
                      {tag.totalRelations}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          tag.isActive
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {tag.isActive ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs tabular-nums">
                      {tag.lastUsedAt ? formatDateShort(tag.lastUsedAt) : "—"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <Link
                          href={`/admin/tags/${tag.id}`}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                          编辑
                        </Link>
                        <form action={toggleTagActiveAction.bind(null, tag.id, !tag.isActive)}>
                          <button
                            type="submit"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {tag.isActive ? "停用" : "启用"}
                          </button>
                        </form>
                        {tag.totalRelations === 0 ? (
                          <DeleteTagButton id={tag.id} name={tag.name} />
                        ) : (
                          <span
                            className="cursor-not-allowed text-muted-foreground/50"
                            title="先移除全部关联或停用后再删除"
                          >
                            删除
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
