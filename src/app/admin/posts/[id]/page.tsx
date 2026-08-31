import { notFound } from "next/navigation";
import { getPostById } from "@/lib/db/queries";
import { updatePostAction } from "../actions";
import { PostForm } from "@/components/admin/post-form";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">编辑文章</h1>
      <PostForm
        action={updatePostAction.bind(null, post.id)}
        defaultValues={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          contentMd: post.contentMd,
          tags: post.tags,
          published: post.published,
        }}
      />
    </div>
  );
}
