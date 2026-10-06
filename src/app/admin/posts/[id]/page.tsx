import { notFound } from "next/navigation";
import { getPostById, listPublicTagsWithCountsUncached } from "@/lib/db/queries";
import { toDatetimeLocal } from "@/lib/format-date";
import { updatePostAction } from "../actions";
import { PostForm } from "@/components/admin/post-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 候选不缓存：编辑器要能看到刚创建的标签（§12）
  const [post, tagOptions] = await Promise.all([
    getPostById(id),
    listPublicTagsWithCountsUncached(),
  ]);
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
        tagOptions={tagOptions}
        defaultValues={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          contentMd: post.contentMd,
          coverImage: post.coverImage ?? "",
          // 含停用标签：组件以「已停用」标记回显，提交时按 {id} 原样保留关联（§8.2 规则 2）
          tags: post.tags,
          // 留空回显（草稿无发布时间）→ 提交空串；发布时由服务端填 now()（§5.3）
          publishedAt: post.publishedAt ? toDatetimeLocal(post.publishedAt) : "",
          published: post.published,
        }}
      />
    </div>
  );
}
