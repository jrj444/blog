import { createPostAction } from "../actions";
import { PostForm } from "@/components/admin/post-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default function NewPostPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="新建文章"
        description="填写内容并选择保存为草稿，或直接发布到站点。"
      />
      <PostForm action={createPostAction} />
    </div>
  );
}
