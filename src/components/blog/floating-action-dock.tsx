"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, List, X } from "lucide-react";
import { useFloatingActions } from "./floating-actions-context";
import { cn } from "@/lib/utils";

/**
 * 全局浮动控制系统：
 * 1. 【回顶按钮】独立的 40px 圆形毛玻璃按钮，中央向上箭头，全站滚动 > 200px 后淡入
 * 2. 【目录按钮】独立的 40px 圆形毛玻璃按钮，位于回顶正上方，仅手机端长文时长驻
 * 3. 【移动端抽屉】点击目录按钮从底部平滑拉起半屏大纲抽屉 (Bottom Drawer)
 */
export function FloatingActionDock() {
  const { tocItems, activeHeadingId, setActiveHeadingId } = useFloatingActions();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 单一滚动监听 (requestAnimationFrame 调度)
  useEffect(() => {
    let ticking = false;

    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollTop = window.scrollY || document.documentElement.scrollTop;
          // 滚动超过 200px 后淡入回顶按钮
          setShowBackToTop(scrollTop > 200);
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // 平滑打开抽屉 (先挂载 DOM，下一帧触发拉起过渡)
  const handleOpenDrawer = useCallback(() => {
    setIsDrawerVisible(true);
    window.requestAnimationFrame(() => {
      setIsDrawerOpen(true);
    });
  }, []);

  // 平滑关闭抽屉 (先向下收起，等 300ms 动画结束后卸载 DOM)
  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setTimeout(() => {
      setIsDrawerVisible(false);
    }, 300);
  }, []);

  // 抽屉开启时监听 Escape 键并锁定背景滚动
  useEffect(() => {
    if (!isDrawerVisible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleCloseDrawer();
      }
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerVisible, handleCloseDrawer]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleJumpHeading = (id: string) => {
    setActiveHeadingId(id);
    handleCloseDrawer();

    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasToc = tocItems.length > 0;

  return (
    <>
      {/* 1. 【目录按钮】独立圆形毛玻璃按钮 (带进场平滑淡入缩放动效与悬浮微回弹) */}
      {hasToc ? (
        <button
          type="button"
          onClick={handleOpenDrawer}
          aria-label="查看文章目录大纲"
          title="查看文章大纲"
          className="animate-in fade-in zoom-in-90 slide-in-from-bottom-2 fixed right-5 bottom-[4.5rem] z-40 grid size-10 place-items-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-md backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-muted hover:text-foreground active:scale-95 xl:hidden"
        >
          <List className="size-4" />
        </button>
      ) : null}

      {/* 2. 【回到顶部按钮】独立圆形毛玻璃按钮，极简纯净 40px (全站通用) */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="回到页面顶部"
        title="回到顶部"
        className={cn(
          "group fixed right-5 bottom-5 z-40 grid size-10 place-items-center rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-muted hover:text-foreground active:scale-95",
          showBackToTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <ArrowUp className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
      </button>

      {/* 3. 【移动端抽屉】底部半屏磨砂大纲抽屉 (Portal 挂载，双向平滑滑动过渡) */}
      {isDrawerVisible && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="文章章节大纲"
              className="fixed inset-0 z-50 flex flex-col justify-end xl:hidden"
            >
              {/* 背景磨砂遮罩 (渐入/渐出过渡) */}
              <div
                onClick={handleCloseDrawer}
                className={cn(
                  "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 ease-out",
                  isDrawerOpen ? "opacity-100" : "opacity-0",
                )}
              />

              {/* 底部抽屉主体 (iOS 弹性曲线平滑滑起/滑落) */}
              <div
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "relative z-10 flex max-h-[72vh] w-full flex-col rounded-t-2xl border-t border-border bg-background p-5 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isDrawerOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
                )}
              >
                {/* 顶部拉手 */}
                <div
                  aria-hidden="true"
                  className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
                />

                {/* 抽屉标题栏 */}
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <List className="size-4 text-foreground" />
                    <h2 className="font-serif text-base font-bold text-foreground">文章大纲</h2>
                    <span className="font-mono text-xs text-muted-foreground">
                      ({tocItems.length} 节)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    aria-label="关闭目录"
                    className="grid size-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* 大纲章节列表 */}
                <nav
                  aria-label="抽屉文章目录"
                  className="mt-3 flex-1 divide-y divide-border/40 overflow-y-auto overscroll-contain pr-1 text-sm"
                >
                  {tocItems.map((item) => {
                    const isActive = item.id === activeHeadingId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleJumpHeading(item.id)}
                        className={cn(
                          "flex w-full cursor-pointer items-baseline gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                          item.level === 3 ? "pl-7 text-xs" : "font-medium",
                          isActive
                            ? "bg-accent font-semibold text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            isActive ? "bg-foreground" : "bg-border",
                          )}
                        />
                        <span className="line-clamp-2 leading-relaxed">{item.text}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
