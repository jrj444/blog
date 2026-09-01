import { listPublishedPosts, getPublishedStats, allTags } from "@/lib/db/queries";
import { HomeFeed } from "@/components/blog/home-feed";
import { Reveal } from "@/components/blog/reveal";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

const HOME_POST_COUNT = 8;

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="text-left sm:text-right">
      <div className="font-serif text-[26px] font-bold text-foreground tabular-nums">{n}</div>
      <div className="mt-2 font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground uppercase">
        {l}
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [{ posts, hasMore }, stats, allTagNames] = await Promise.all([
    listPublishedPosts({ page: 1, pageSize: HOME_POST_COUNT }),
    getPublishedStats(),
    allTags(),
  ]);

  const updatedLabel = stats.lastUpdated
    ? `${String(stats.lastUpdated.getMonth() + 1).padStart(2, "0")}.${String(
        stats.lastUpdated.getDate(),
      ).padStart(2, "0")}`
    : "—";

  return (
    <div>
      <section className="pt-12 sm:pt-24">
        <Reveal>
          <p className="mb-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
            Journal · 2026
            <span aria-hidden className="h-px max-w-[120px] flex-1 bg-border" />
          </p>

          <h1 className="font-serif text-[clamp(56px,8.6vw,104px)] leading-[0.92] font-bold tracking-[-0.02em]">
            Latest
            <em className="font-serif font-normal text-primary italic">Writing</em>
          </h1>
        </Reveal>

        <Reveal className="mt-10 border-t border-border pt-6">
          <dl className="flex justify-start gap-8 sm:justify-end sm:gap-14">
            <Stat n={stats.total} l="Articles" />
            <Stat n={stats.thisYear} l="This Year" />
            <Stat n={updatedLabel} l="Updated" />
          </dl>
        </Reveal>
      </section>

      <section className="mt-16">
        <HomeFeed posts={posts} hasMore={hasMore} allTags={allTagNames} />
      </section>
    </div>
  );
}
