import { createPostAction } from "../actions";
import { PostForm } from "@/components/admin/post-form";

export default function NewPostPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">新建文章</h1>
      <PostForm action={createPostAction} />
    </div>
  );
}
