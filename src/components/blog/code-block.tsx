"use client";

import { useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Check, Copy } from "lucide-react";
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
}) {
  void _node;
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const rawFromAttr = props["data-raw"];
  const language = props["data-language"];
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
        // 非安全上下文（如部分内网/开发环境）降级处理
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

  return (
    <div className="group/code relative">
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-2">
        {langLabel ? (
          <span className="font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/60 uppercase select-none">
            {langLabel}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "已复制代码" : "复制代码"}
          title={copied ? "已复制" : "复制代码"}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-background/80 px-2 font-mono text-[11px] text-muted-foreground backdrop-blur-sm transition-all",
            "hover:border-foreground/25 hover:bg-background hover:text-foreground",
            "focus-visible:border-foreground/40 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
            "opacity-80 sm:opacity-0 sm:group-hover/code:opacity-100",
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
      </div>

      <pre ref={preRef} className={cn("relative", className)} {...props}>
        {children}
      </pre>
    </div>
  );
}
