"use client";

import { useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Check, Copy, FileCode, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Zsh",
  json: "JSON",
  sql: "SQL",
  py: "Python",
  python: "Python",
  css: "CSS",
  html: "HTML",
  md: "Markdown",
  markdown: "Markdown",
  yaml: "YAML",
  yml: "YAML",
  dockerfile: "Dockerfile",
  docker: "Docker",
  rust: "Rust",
  go: "Go",
  diff: "Diff",
};

function formatLanguage(lang?: string): string | null {
  if (!lang) return null;
  const lower = lang.toLowerCase().trim();
  return LANGUAGE_MAP[lower] ?? (lower.length <= 4 ? lower.toUpperCase() : lower);
}

export function CodeBlock({
  children,
  className,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"pre"> & {
  node?: unknown;
  "data-language"?: string;
  "data-raw"?: string;
  "data-title"?: string;
  "data-show-lines"?: string;
  "data-line-count"?: string;
}) {
  void _node;
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const rawFromAttr = props["data-raw"];
  const language = props["data-language"];
  const title = props["data-title"];
  const lineCount = props["data-line-count"] ? Number(props["data-line-count"]) : 0;
  const [showLineNumbers, setShowLineNumbers] = useState(props["data-show-lines"] === "true");

  const langLabel = formatLanguage(language);

  async function handleCopy() {
    let textToCopy = rawFromAttr;

    if (!textToCopy && preRef.current) {
      // 兜底提取：取内部 code 节点的 textContent，避免复制额外 DOM
      const codeEl = preRef.current.querySelector("code");
      textToCopy = codeEl?.textContent ?? preRef.current.textContent ?? "";
    }

    if (!textToCopy) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // 非安全上下文降级处理
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  }

  // 复制按钮组件
  const copyButton = (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "已复制代码" : "复制代码"}
      title={copied ? "已复制" : "复制代码"}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-background/80 px-2 font-mono text-[11px] text-muted-foreground backdrop-blur-sm transition-all",
        "hover:border-foreground/25 hover:bg-background hover:text-foreground",
        "focus-visible:border-foreground/40 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        !title && "opacity-80 sm:opacity-0 sm:group-hover/code:opacity-100",
        copied &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 opacity-100 sm:opacity-100 dark:text-emerald-400",
      )}
    >
      {copied ? (
        <>
          <Check aria-hidden className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
            已复制
          </span>
        </>
      ) : (
        <>
          <Copy aria-hidden className="size-3.5" />
          <span className="hidden sm:inline">复制</span>
        </>
      )}
    </button>
  );

  // 行号切换按钮
  const lineNumbersButton = lineCount >= 2 && (
    <button
      type="button"
      onClick={() => setShowLineNumbers((v) => !v)}
      aria-label={showLineNumbers ? "隐藏行号" : "显示行号"}
      title={showLineNumbers ? "隐藏行号" : "显示行号"}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-border/80 bg-background/80 px-1.5 font-mono text-[11px] backdrop-blur-sm transition-all",
        "hover:border-foreground/25 hover:bg-background hover:text-foreground",
        !title && "opacity-80 sm:opacity-0 sm:group-hover/code:opacity-100",
        showLineNumbers
          ? "border-primary/40 bg-primary/10 font-semibold text-primary opacity-100 sm:opacity-100"
          : "text-muted-foreground",
      )}
    >
      <Hash aria-hidden className="size-3.5" />
      <span className="sr-only sm:not-sr-only sm:text-[10.5px]">行号</span>
    </button>
  );

  return (
    <div className="group/code relative">
      {/* 场景一：带有文件名的代码块顶栏 */}
      {title ? (
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-1.5 font-mono text-xs">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <FileCode aria-hidden className="size-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium text-foreground/80">{title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {langLabel ? (
              <span className="text-[10.5px] font-medium tracking-wider text-muted-foreground/60 uppercase select-none">
                {langLabel}
              </span>
            ) : null}
            {lineNumbersButton}
            {copyButton}
          </div>
        </div>
      ) : (
        /* 场景二：无文件名的浮动快捷操作组 */
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
          {langLabel ? (
            <span className="mr-0.5 font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/60 uppercase select-none">
              {langLabel}
            </span>
          ) : null}
          {lineNumbersButton}
          {copyButton}
        </div>
      )}

      <pre
        ref={preRef}
        className={cn("relative", showLineNumbers && "code-with-lines", className)}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
