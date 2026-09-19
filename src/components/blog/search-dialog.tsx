"use client";

import { useEffect, useState, useRef, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  FileText,
  Calendar,
  Clock,
  Loader2,
  CornerDownLeft,
  BookOpen,
  Tag as TagIcon,
  User,
  Home,
} from "lucide-react";
import { searchPublishedPostsAction, type SearchResultItem } from "@/app/(blog)/search-action";
import { cn } from "@/lib/utils";

const QUICK_LINKS = [
  { href: "/", label: "首页 (Home)", icon: Home },
  { href: "/posts", label: "所有文章 (Archive)", icon: BookOpen },
  { href: "/tags", label: "标签分类 (Tags)", icon: TagIcon },
  { href: "/about", label: "关于我 (About)", icon: User },
];

const emptySubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    emptySubscribe,
    () => /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 弹窗挂载时锁定背景滚动并聚焦输入框
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(timer);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 输入防抖查询
  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedIndex(0);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!value.trim()) {
      setResults([]);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        const data = await searchPublishedPostsAction(value);
        setResults(data);
      });
    }, 200);
  }

  // 关闭并跳转
  function handleNavigate(url: string) {
    onClose();
    router.push(url);
  }

  // 键盘导航（上下箭头切换高亮、Enter 跳转）
  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const isSearching = query.trim().length > 0;
    const maxItems = isSearching ? results.length : QUICK_LINKS.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (maxItems > 0) {
        setSelectedIndex((prev) => (prev + 1) % maxItems);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (maxItems > 0) {
        setSelectedIndex((prev) => (prev - 1 + maxItems) % maxItems);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isSearching) {
        if (results[selectedIndex]) {
          handleNavigate(`/posts/${results[selectedIndex].slug}`);
        }
      } else {
        if (QUICK_LINKS[selectedIndex]) {
          handleNavigate(QUICK_LINKS[selectedIndex].href);
        }
      }
    }
  }

  // 保证选中项在视图内
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="搜索文章"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] sm:pt-[14vh]"
    >
      {/* 背景模糊浮层 */}
      <div
        className="fixed inset-0 bg-background/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div className="animate-in fade-in-0 zoom-in-95 relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl duration-150">
        {/* 顶部搜索输入框 */}
        <div className="flex items-center border-b border-border px-3.5 py-3">
          {isPending ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <Search className="size-4 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="输入关键词搜索文章标题、摘要或正文..."
            className="ml-3 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="清空搜索内容"
            >
              <X className="size-3.5" />
            </button>
          )}
          <kbd className="ml-2 hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* 内容区域 */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.trim().length === 0 ? (
            // 默认状态：快速导航
            <div className="p-2">
              <div className="px-2 py-1.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                快捷直达
              </div>
              <ul ref={listRef} className="mt-1 space-y-1">
                {QUICK_LINKS.map((link, idx) => {
                  const Icon = link.icon;
                  const active = selectedIndex === idx;
                  return (
                    <li key={link.href}>
                      <button
                        type="button"
                        onClick={() => handleNavigate(link.href)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="size-4 text-muted-foreground" />
                          <span>{link.label}</span>
                        </div>
                        {active && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : results.length > 0 ? (
            // 匹配到搜索结果
            <div>
              <div className="px-2 py-1.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                找到 {results.length} 篇相关文章
              </div>
              <ul ref={listRef} className="mt-1 space-y-1">
                {results.map((item, idx) => {
                  const active = selectedIndex === idx;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavigate(`/posts/${item.slug}`)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-lg p-3 text-left transition-colors",
                          active
                            ? "bg-muted/80 text-foreground"
                            : "text-foreground/90 hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-medium">
                            <FileText
                              className={cn(
                                "size-4 shrink-0",
                                active ? "text-primary" : "text-muted-foreground",
                              )}
                            />
                            <span className="line-clamp-1">{item.title}</span>
                          </div>
                          {active && (
                            <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </div>

                        {item.excerpt && (
                          <p className="line-clamp-1 pl-6 text-xs text-muted-foreground">
                            {item.excerpt}
                          </p>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-3 pl-6 font-mono text-[10.5px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="size-3" />
                            {item.date}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {item.readingMinutes} 分钟
                          </span>
                          {item.tags.length > 0 && (
                            <div className="flex items-center gap-1">
                              {item.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded border border-border/60 bg-background/80 px-1 py-0.5 text-[10px]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : !isPending ? (
            // 搜索无匹配结果
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-foreground">未找到匹配文章</p>
              <p className="mt-1 text-xs text-muted-foreground">
                换个关键词试试，或检查是否包含拼写错误
              </p>
            </div>
          ) : null}
        </div>

        {/* 底部按键提示栏 */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3.5 py-2 font-mono text-[10.5px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 py-0.5">↑</kbd>
              <kbd className="rounded border border-border bg-background px-1 py-0.5">↓</kbd>
              切换
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 py-0.5">↵</kbd>
              选择
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1 py-0.5">ESC</kbd>
              关闭
            </span>
          </div>
          <span className="hidden sm:inline">JIANG RUIJIAN technical journal</span>
        </div>
      </div>
    </div>
  );
}

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const isMac = useIsMac();

  // 快捷键全局监听: Cmd+K / Ctrl+K 打开，Esc 关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      {/* 导航栏触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="全局搜索文章 (快捷键: Cmd+K 或 Ctrl+K)"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground sm:w-44 sm:justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Search className="size-3.5" />
          <span className="hidden sm:inline">搜索文章...</span>
        </div>
        <kbd className="hidden rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      {/* 弹窗遮罩与对话框（打开时挂载，关闭时自动销毁内部状态） */}
      {open && <SearchModal onClose={() => setOpen(false)} />}
    </>
  );
}
