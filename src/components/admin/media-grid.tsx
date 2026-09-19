"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileImage,
  Filter,
  HardDrive,
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";
import type { StoredMediaItemWithRefs } from "@/lib/storage";
import { compressImage } from "@/lib/compress-image";
import {
  createMediaUploadTargetAction,
  deleteMediaItemAction,
  listMediaAction,
} from "@/app/admin/media/actions";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type FilterTab = "all" | "covers" | "posts" | "media" | "unreferenced";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDateStr(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "未知时间";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "未知时间";
  }
}

function extractFilename(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
}

export function MediaGrid({ initialItems }: { initialItems: StoredMediaItemWithRefs[] }) {
  const [items, setItems] = useState<StoredMediaItemWithRefs[]>(initialItems);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 上传状态
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 复制反馈状态
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<"md" | "url" | null>(null);

  // 弹窗二次确认删除目标对象
  const [targetItemToDelete, setTargetItemToDelete] = useState<StoredMediaItemWithRefs | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // 灯箱放大预览
  const [previewItem, setPreviewItem] = useState<StoredMediaItemWithRefs | null>(null);

  // 刷新素材列表
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const res = await listMediaAction();
    if (res.ok) {
      setItems(res.items);
    }
    setIsRefreshing(false);
  }, []);

  // 统计数据
  const totalCount = items.length;
  const totalBytes = useMemo(() => items.reduce((acc, curr) => acc + curr.size, 0), [items]);
  const coversCount = useMemo(
    () => items.filter((i) => i.key.startsWith("covers/")).length,
    [items],
  );
  const postsCount = useMemo(() => items.filter((i) => i.key.startsWith("posts/")).length, [items]);
  const mediaCount = useMemo(() => items.filter((i) => i.key.startsWith("media/")).length, [items]);
  const unreferencedCount = useMemo(
    () => items.filter((i) => i.references.length === 0).length,
    [items],
  );
  const referencedCount = useMemo(
    () => items.filter((i) => i.references.length > 0).length,
    [items],
  );

  // 过滤后的列表
  const filteredItems = useMemo(() => {
    let list = items;
    if (activeTab === "covers") list = list.filter((i) => i.key.startsWith("covers/"));
    if (activeTab === "posts") list = list.filter((i) => i.key.startsWith("posts/"));
    if (activeTab === "media") list = list.filter((i) => i.key.startsWith("media/"));
    if (activeTab === "unreferenced") list = list.filter((i) => i.references.length === 0);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => i.key.toLowerCase().includes(q));
    }
    return list;
  }, [items, activeTab, searchQuery]);

  // 处理文件上传 (单图或多图)
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadMessage("正在处理图片...");

    try {
      let successCount = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;

        setUploadMessage(`正在压缩并直传 ${file.name}...`);
        const compressed = await compressImage(file);

        // 获取 R2 直传凭证
        const targetRes = await createMediaUploadTargetAction({
          type: compressed.type,
          size: compressed.size,
          prefix: "media",
        });

        if (!targetRes.ok) {
          throw new Error(targetRes.error);
        }

        // 客户端直接 PUT 到 Cloudflare R2
        const putRes = await fetch(targetRes.uploadUrl, {
          method: "PUT",
          body: compressed,
          headers: targetRes.headers,
        });

        if (!putRes.ok) {
          throw new Error(`直传 R2 失败 (${putRes.status})`);
        }

        // 成功，将新素材即刻推入列表首位（新上传素材默认为未引用）
        const newItem: StoredMediaItemWithRefs = {
          key: targetRes.key,
          size: compressed.size,
          lastModified: new Date().toISOString(),
          publicUrl: targetRes.publicUrl,
          references: [],
        };

        setItems((prev) => [newItem, ...prev.filter((p) => p.key !== newItem.key)]);
        successCount++;
      }

      setUploadMessage(`成功上传 ${successCount} 张素材`);
      setTimeout(() => setUploadMessage(null), 3000);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadMessage(err instanceof Error ? err.message : "上传失败，请稍后重试");
      setTimeout(() => setUploadMessage(null), 4000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 复制反馈
  const handleCopy = (key: string, text: string, type: "md" | "url") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedKey(null);
      setCopiedType(null);
    }, 2000);
  };

  // 执行删除
  const handleConfirmDelete = async (key: string) => {
    setIsDeleting(true);
    const res = await deleteMediaItemAction(key);
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.key !== key));
      setTargetItemToDelete(null);
    } else {
      alert(res.error || "删除失败");
    }
    setIsDeleting(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. 统计与容量看板 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
            <ImageIcon className="size-4" />
            <span>素材总量</span>
          </div>
          <div className="mt-2 font-serif text-2xl font-bold text-foreground">
            {totalCount}{" "}
            <span className="font-mono text-xs font-normal text-muted-foreground">张</span>
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            已引用 {referencedCount} · 未引用 {unreferencedCount}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
            <HardDrive className="size-4" />
            <span>已占用存储</span>
          </div>
          <div className="mt-2 font-serif text-2xl font-bold text-foreground">
            {formatBytes(totalBytes)}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            通过 WebP 压缩节省约 65% 流量
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
            <FileImage className="size-4" />
            <span>存储引擎</span>
          </div>
          <div className="mt-2 font-serif text-2xl font-bold text-foreground">Cloudflare R2</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            全球 CDN 加速 · 永久不可变缓存
          </div>
        </div>
      </div>

      {/* 2. 拖拽与点击直传区域 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files) void handleUploadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-6 text-center transition-colors hover:border-foreground/50 hover:bg-muted/40",
          isUploading && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleUploadFiles(e.target.files);
          }}
        />

        <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
          {isUploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          {isUploading ? "正在直传至 Cloudflare R2..." : "点击或拖拽多张图片到这里上传"}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          支持 JPG / PNG / WebP / AVIF · 客户端智能压缩至最优体积
        </p>

        {uploadMessage ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 font-mono text-xs text-background shadow-md">
            <span>{uploadMessage}</span>
          </div>
        ) : null}
      </div>

      {/* 3. 筛选、搜索与刷新工具条 */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        {/* 分类 Tab */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1 text-xs">
          {[
            { key: "all" as const, label: "全部", count: totalCount },
            { key: "covers" as const, label: "封面图", count: coversCount },
            { key: "posts" as const, label: "正文插图", count: postsCount },
            { key: "media" as const, label: "媒体素材", count: mediaCount },
            { key: "unreferenced" as const, label: "未被引用", count: unreferencedCount },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "bg-background/60 text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 搜索与刷新 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文件名或路径…"
              className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="刷新素材列表"
            aria-label="刷新素材列表"
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* 4. 图片卡片网格 */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => {
            const filename = extractFilename(item.key);
            const isCover = item.key.startsWith("covers/");
            const isPost = item.key.startsWith("posts/");
            const tagLabel = isCover ? "封面" : isPost ? "插图" : "素材";
            const mdSyntax = `![${filename}](${item.publicUrl})`;

            const isCopiedMd = copiedKey === item.key && copiedType === "md";
            const isCopiedUrl = copiedKey === item.key && copiedType === "url";
            const hasReferences = item.references.length > 0;

            return (
              <div
                key={item.key}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-foreground/40 hover:shadow-md"
              >
                {/* 图片视口 (含悬浮操作与点击预览) */}
                <div
                  onClick={() => setPreviewItem(item)}
                  className="relative aspect-[16/10] w-full cursor-zoom-in overflow-hidden border-b border-border bg-muted/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.publicUrl}
                    alt={filename}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* 悬停放大镜角标 */}
                  <span className="pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <ZoomIn className="size-3.5" />
                  </span>

                  {/* 底部角标区：分类徽标 + 引用状态 */}
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                    <span className="rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
                      {tagLabel}
                    </span>
                    {hasReferences ? (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-background/85 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-600 backdrop-blur-sm dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        已引用 ({item.references.length})
                      </span>
                    ) : (
                      <span className="rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/80 backdrop-blur-sm">
                        未引用
                      </span>
                    )}
                  </div>
                </div>

                {/* 卡片详情信息 */}
                <div className="flex flex-1 flex-col justify-between p-3.5">
                  <div>
                    <p
                      className="truncate font-mono text-xs font-semibold text-foreground"
                      title={item.key}
                    >
                      {filename}
                    </p>
                    <p className="mt-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                      <span>{formatBytes(item.size)}</span>
                      <span>{formatDateStr(item.lastModified)}</span>
                    </p>

                    {/* 引用文章列表或未引用提示 */}
                    {hasReferences ? (
                      <div className="mt-2.5 rounded-lg border border-border/70 bg-muted/30 p-2 text-[11px]">
                        <p className="font-mono text-[10px] font-medium text-muted-foreground">
                          引用来源：
                        </p>
                        <ul className="mt-1 space-y-1">
                          {item.references.slice(0, 2).map((ref) => (
                            <li key={ref.id} className="truncate">
                              <Link
                                href={`/admin/posts/${ref.id}`}
                                className="inline-flex max-w-full items-center gap-1 text-foreground/90 transition-colors hover:text-primary hover:underline"
                                title={ref.title}
                              >
                                <span className="py-0.2 shrink-0 rounded border border-border/60 bg-background px-1 font-mono text-[9.5px] text-muted-foreground">
                                  {ref.isCover ? "封面" : "插图"}
                                </span>
                                <span className="truncate">{ref.title}</span>
                              </Link>
                            </li>
                          ))}
                          {item.references.length > 2 ? (
                            <li className="font-mono text-[10px] text-muted-foreground">
                              等共 {item.references.length} 处引用
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-md bg-muted/20 px-2 py-1 font-mono text-[10.5px] text-muted-foreground/70">
                        ⚪ 游离素材 · 暂无文章引用
                      </div>
                    )}
                  </div>

                  {/* 操作栏 */}
                  <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.key, mdSyntax, "md")}
                      className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-border/80 bg-background/80 px-2 font-mono text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      title="复制 Markdown 语法"
                    >
                      {isCopiedMd ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      <span>{isCopiedMd ? "已复制" : "复制 MD"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(item.key, item.publicUrl, "url")}
                      className="grid size-7 shrink-0 place-items-center rounded-md border border-border/80 bg-background/80 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      title="复制图片直链 URL"
                    >
                      {isCopiedUrl ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <ExternalLink className="size-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetItemToDelete(item)}
                      className="grid size-7 shrink-0 place-items-center rounded-md border border-border/80 bg-background/80 text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      title="从 R2 删除此图片"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Filter className="mb-2 size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">没有找到匹配的媒体素材</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            试试更换筛选分类或清空搜索关键词
          </p>
        </div>
      )}

      {/* 5. 放大预览灯箱弹窗 */}
      {previewItem ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewItem(null)}
          className="animate-in fade-in fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-background/85 p-4 backdrop-blur-md duration-200"
        >
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            className="absolute top-4 right-4 z-10 flex items-center gap-1 rounded-full border border-border bg-background/80 px-3 py-1.5 font-mono text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition hover:bg-muted"
          >
            <X className="size-3.5" />
            <span>Esc</span>
          </button>

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90vh] max-w-[92vw] cursor-default flex-col items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewItem.publicUrl}
              alt={previewItem.key}
              className="max-h-[82vh] max-w-[92vw] rounded-xl border border-border object-contain shadow-2xl"
            />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 font-mono text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {extractFilename(previewItem.key)}
              </span>
              <span>·</span>
              <span>{formatBytes(previewItem.size)}</span>
              <span>·</span>
              {previewItem.references.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  已引用 ({previewItem.references.length})
                </span>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5">未被引用</span>
              )}
              <span>·</span>
              <a
                href={previewItem.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
              >
                在新标签打开
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* 6. 二次确认删除弹窗 (基于 shadcn/ui AlertDialog) */}
      <AlertDialog
        open={!!targetItemToDelete}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setTargetItemToDelete(null);
        }}
      >
        <AlertDialogContent closeDisabled={isDeleting}>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              {targetItemToDelete && targetItemToDelete.references.length > 0 ? (
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-5" />
                </div>
              ) : (
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Trash2 className="size-5" />
                </div>
              )}
              <div>
                <AlertDialogTitle>
                  {targetItemToDelete && targetItemToDelete.references.length > 0
                    ? "高危操作：确认删除该素材？"
                    : "确认删除该媒体素材？"}
                </AlertDialogTitle>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {targetItemToDelete?.key}
                </p>
              </div>
            </div>

            {targetItemToDelete ? (
              <div className="mt-2 space-y-3 text-left">
                {/* 缩略图与文件信息预览 */}
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={targetItemToDelete.publicUrl}
                    alt={targetItemToDelete.key}
                    className="size-12 shrink-0 rounded-lg border border-border bg-background object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-semibold text-foreground">
                      {extractFilename(targetItemToDelete.key)}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {formatBytes(targetItemToDelete.size)} ·{" "}
                      {formatDateStr(targetItemToDelete.lastModified)}
                    </p>
                  </div>
                </div>

                {/* 引用警告或未引用说明 */}
                {targetItemToDelete.references.length > 0 ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-destructive">
                      <span>
                        ⚠️ 该图片正在被以下 {targetItemToDelete.references.length} 篇文章使用：
                      </span>
                    </p>
                    <ul className="mt-2 space-y-1.5 pl-1">
                      {targetItemToDelete.references.map((ref) => (
                        <li key={ref.id} className="flex items-center gap-1.5 text-foreground/90">
                          <span className="py-0.2 shrink-0 rounded border border-border/80 bg-background/80 px-1 font-mono text-[9.5px] text-muted-foreground">
                            {ref.isCover ? "封面" : "插图"}
                          </span>
                          <span className="truncate font-medium">{ref.title}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2.5 text-[11px] leading-normal text-destructive/90">
                      一旦从 Cloudflare R2 永久删除，上述文章内的图片将彻底失效（裂图
                      404）且无法恢复！
                    </p>
                  </div>
                ) : (
                  <AlertDialogDescription>
                    此素材为游离素材，未被任何文章引用。从 Cloudflare R2
                    永久删除后将释放存储空间，此操作不可撤销。
                  </AlertDialogDescription>
                )}
              </div>
            ) : null}
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              size="default"
              disabled={isDeleting}
              onClick={() => {
                if (targetItemToDelete) void handleConfirmDelete(targetItemToDelete.key);
              }}
              className="gap-1.5"
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span>
                {targetItemToDelete && targetItemToDelete.references.length > 0
                  ? "仍要永久删除"
                  : "确认删除"}
              </span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
