import { createTagAction } from "../actions";
import { TagForm } from "@/components/admin/tag-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default function NewTagPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <AdminPageHeader
        title="新建标签"
        description="名称必填；slug 留空自动生成，创建后不可修改。"
      />
      <TagForm action={createTagAction} mode="create" />
    </div>
  );
}
