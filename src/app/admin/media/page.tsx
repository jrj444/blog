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
  const [{ items, hasMore, count }, refMap] = await Promise.all([
    listObjects(undefined, undefined, 100),
    listMediaReferences(),
  ]);

  const itemsWithRefs: StoredMediaItemWithRefs[] = items.map((item) => ({
    ...item,
    references: refMap[item.key] ?? [],
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="媒体库"
        description={`集中管理已上传至 Cloudflare R2 的文章封面与正文插图资产。当前展示 ${count} 张。`}
      />

      {hasMore && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          ⚠️ 已达单页上限（100 张），还有更多文件未显示。后续将支持翻页加载。
        </div>
      )}

      <MediaGrid initialItems={itemsWithRefs} />
    </div>
  );
}
