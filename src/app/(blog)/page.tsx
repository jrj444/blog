import Link from "next/link";
import { Feather } from "lucide-react";
import { listPublishedPosts } from "@/lib/db/queries";
import { PostCard } from "@/components/blog/post-card";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

const HOME_POST_COUNT = 5;

export default async function HomePage() {
  const { posts, hasMore } = await listPublishedPosts(1, HOME_POST_COUNT);

  return (
    <div>
      <section className="pt-6 sm:pt-12">
        <h1 className="text-4xl font-bold leading-[1.15] tracking-tight sm:text-[2.75rem]">
          写代码,<span className="text-muted-foreground">记录思考。</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
          你好,我是 jiangruijian。这里是我的个人博客,记录我在技术上的探索、踩过的坑,以及一些零碎的思考。
        </p>
      </section>

      <section className="mt-16">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            最新文章
          </h2>
          {hasMore && (
            <Link
              href="/posts"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              全部文章 →
            </Link>
          )}
        </div>

        {posts.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
            <Feather aria-hidden className="mb-1 size-5 text-muted-foreground/50" />
            <p className="text-sm font-medium">还没有已发布的文章</p>
            <p className="text-xs text-muted-foreground">文章发布后,会第一时间出现在这里。</p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-border/70">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
