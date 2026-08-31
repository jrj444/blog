import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getPublishedPostBySlug } from "@/lib/db/queries";
import { Markdown } from "@/components/blog/markdown";
import { TagBadge } from "@/components/blog/tag-badge";
import { formatDate } from "@/lib/format-date";

// 页面数据来自数据库,每次请求实时渲染(构建期不访问数据库)。
export const dynamic = "force-dynamic";

// React cache 让 generateMetadata 与页面共用同一次查询结果。
const getPost = cache(getPublishedPostBySlug);

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: "文章不存在" };
  }

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <article>
      <Link
        href="/posts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        返回文章列表
      </Link>

      <header className="mt-6">
        <h1 className="text-3xl font-bold leading-snug tracking-tight sm:text-4xl sm:leading-tight">
          {post.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <time dateTime={post.createdAt.toISOString()} className="tabular-nums">
            {formatDate(post.createdAt)}
          </time>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
      </header>

      <hr className="mt-8 border-border" />

      <Markdown content={post.contentMd} className="mt-8" />

      <footer className="mt-14 border-t pt-6">
        <Link
          href="/posts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          返回文章列表
        </Link>
      </footer>
    </article>
  );
}
