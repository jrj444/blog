import type { Metadata } from "next";
import { listObjects, type StoredMediaItemWithRefs } from "@/lib/storage";
import { listMediaReferences } from "@/lib/db/queries";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MediaGrid } from "@/components/admin/media-grid";

export const metadata: Metadata = {
  title: "媒体库 | 控制台",
};

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const [items, refMap] = await Promise.all([listObjects(), listMediaReferences()]);

  const itemsWithRefs: StoredMediaItemWithRefs[] = items.map((item) => ({
    ...item,
    references: refMap[item.key] ?? [],
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="媒体库"
        description="集中管理已上传至 Cloudflare R2 的文章封面与正文插图资产。"
      />

      <MediaGrid initialItems={itemsWithRefs} />
    </div>
  );
}
