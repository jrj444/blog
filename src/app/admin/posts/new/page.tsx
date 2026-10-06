import { createPostAction } from "../actions";
import { PostForm } from "@/components/admin/post-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { listPublicTagsWithCountsUncached } from "@/lib/db/queries";

// 不缓存：编辑器候选要能看到刚创建的标签（§12）
export default async function NewPostPage() {
  const tagOptions = await listPublicTagsWithCountsUncached();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="新建文章"
        description="填写内容并选择保存为草稿，或直接发布到站点。"
      />
      <PostForm action={createPostAction} tagOptions={tagOptions} />
    </div>
  );
}
