import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import type { Metadata } from "next";
import { getPublishedPostBySlug, getPostSiblings } from "@/lib/db/queries";
import { MarkdownWithToc } from "@/components/blog/markdown";
import { PostNavigation } from "@/components/blog/post-navigation";
import { TagBadge } from "@/components/blog/tag-badge";
import { ViewTracker } from "@/components/blog/view-tracker";
import { formatDate, toIsoString } from "@/lib/format-date";

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
    alternates: {
      canonical: `/posts/${post.slug}`,
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt ?? undefined,
      publishedTime: toIsoString(post.createdAt),
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    twitter: {
      card: post.coverImage ? "summary_large_image" : "summary",
      title: post.title,
      description: post.excerpt ?? undefined,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  const { prev, next } = await getPostSiblings(post.id);

  return (
    <article className="mx-auto max-w-[68rem]">
      <div className="mx-auto max-w-3xl xl:mx-0">
        <Link
          href="/posts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          返回文章列表
        </Link>

        <header className="mt-6">
          <h1 className="font-serif text-3xl leading-snug font-bold tracking-tight sm:text-4xl sm:leading-tight">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            <time dateTime={toIsoString(post.createdAt)} className="tabular-nums">
              {formatDate(post.createdAt)}
            </time>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Eye aria-hidden className="size-3.5" />
              {post.views} 次阅读
            </span>
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            )}
          </div>
        </header>

        {post.coverImage ? (
          // 文章头图：走 Cloudflare 边缘缓存（上传时已带 immutable），这里不再走 Vercel 图片优化
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt=""
            width={1200}
            height={675}
            className="mt-8 aspect-[16/9] w-full rounded-lg border border-border object-cover"
          />
        ) : null}

        <hr className="mt-8 border-border" />
      </div>

      <MarkdownWithToc
        content={post.contentMd}
        className="mt-8"
        footer={
          <footer className="mt-14 space-y-6 border-t border-border pt-6">
            <PostNavigation prev={prev} next={next} />
            <div className="pt-2">
              <Link
                href="/posts"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft aria-hidden className="size-4" />
                返回文章列表
              </Link>
            </div>
          </footer>
        }
      />

      <ViewTracker postId={post.id} />
    </article>
  );
}
