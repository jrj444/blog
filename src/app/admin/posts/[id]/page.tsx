import { notFound } from "next/navigation";
import { getPostById } from "@/lib/db/queries";
import { updatePostAction } from "../actions";
import { PostForm } from "@/components/admin/post-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="编辑文章"
        description={
          post.published
            ? "当前文章已发布，修改后可重新发布更新。"
            : "当前文章为草稿，完成后可发布到站点。"
        }
      />
      <PostForm
        action={updatePostAction.bind(null, post.id)}
        defaultValues={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          contentMd: post.contentMd,
          coverImage: post.coverImage ?? "",
          tags: post.tags,
          published: post.published,
        }}
      />
    </div>
  );
}
