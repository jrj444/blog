"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyContentButtonProps = {
  /** 文章标题：有值时复制为「# 标题 + 空行 + 正文」 */
  title?: string;
  /** 要复制的原始内容（Markdown 源文） */
  content: string;
  label?: string;
  copiedLabel?: string;
  /** link：行内文字样式（后台列表行）；button：描边按钮样式（前台详情页，默认） */
  variant?: "button" | "link";
  className?: string;
};

const STYLES = {
  button:
    "inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/60 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted/50 hover:text-foreground",
  link: "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
} as const;

/**
 * 一键复制原始内容（Markdown 源文），前台文章页与后台文章列表共用。
 * navigator.clipboard 需要安全上下文（https / localhost）；失败给出可感知的
 * 「复制失败」反馈并自动复位，不静默。
 */
export function CopyContentButton({
  title,
  content,
  label = "复制原文",
  copiedLabel = "已复制",
  variant = "button",
  className,
}: CopyContentButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timerRef = useRef<number | undefined>(undefined);
  const copyText = title ? `# ${title}\n\n${content}` : content;

  // 卸载时清掉复位定时器，避免对已卸载组件 setState
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setState("copied");
    } catch {
      setState("error");
    }
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setState("idle"), 1600);
  }

  const text = state === "copied" ? copiedLabel : state === "error" ? "复制失败" : label;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={cn(STYLES[variant], state === "error" && "text-destructive", className)}
    >
      {state === "copied" ? (
        <Check aria-hidden className="size-3.5 text-emerald-600" />
      ) : state === "error" ? (
        <X aria-hidden className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      <span>{text}</span>
    </button>
  );
}
