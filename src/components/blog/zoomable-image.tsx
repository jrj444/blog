"use client";

import { useState, useEffect, useCallback, type ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";

/**
 * 可全屏无缝放大的文章图片组件 (Medium-Zoom 风格):
 * 替代原生 <img>，点击后弹出磨砂全屏居中灯箱，支持 Esc、点击任意处或右上角关闭。
 */
export function ZoomableImage({ src, alt, className, ...props }: ComponentPropsWithoutRef<"img">) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // 监听 Escape 快捷键退出与锁定页面滚动
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!src) return null;

  return (
    <>
      <figure className="my-6 block">
        <span className="group relative block overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? ""}
            loading="lazy"
            decoding="async"
            onClick={() => setIsOpen(true)}
            className={`w-full cursor-zoom-in object-cover transition-all duration-200 group-hover:scale-[1.01] dark:brightness-95 ${className ?? ""}`}
            {...props}
          />
          {/* 悬浮提示角标 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1 rounded-md border border-border/80 bg-background/80 px-2 py-1 font-mono text-[10px] text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
          >
            <ZoomIn className="size-3" />
            <span>点击放大</span>
          </span>
        </span>
        {alt ? (
          <figcaption className="mt-2 text-center font-mono text-xs text-muted-foreground">
            {alt}
          </figcaption>
        ) : null}
      </figure>

      {/* 全屏灯箱 Portal */}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt || "图片放大预览"}
              onClick={handleClose}
              className="animate-in fade-in fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center bg-background/85 p-4 backdrop-blur-md transition-opacity duration-200"
            >
              {/* 右上角关闭控制钮 */}
              <button
                type="button"
                onClick={handleClose}
                aria-label="关闭预览 (Esc)"
                className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 font-mono text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition hover:bg-muted"
              >
                <X className="size-3.5" />
                <span className="hidden sm:inline">Esc</span>
              </button>

              {/* 大图容器 */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative flex max-h-[88vh] max-w-[92vw] cursor-default flex-col items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={alt ?? ""}
                  className="max-h-[82vh] max-w-[92vw] rounded-lg border border-border/80 object-contain shadow-2xl"
                />
                {alt ? (
                  <p className="mt-3 text-center font-mono text-xs tracking-wider text-muted-foreground">
                    {alt}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
