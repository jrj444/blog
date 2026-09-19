import React, { isValidElement, type ReactNode } from "react";
import { Info, Lightbulb, Flame, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type CalloutType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const CALLOUT_CONFIGS: Record<
  CalloutType,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    borderClass: string;
    bgClass: string;
    titleClass: string;
  }
> = {
  NOTE: {
    title: "Note",
    icon: Info,
    borderClass: "border-l-blue-500 dark:border-l-blue-400 border-border/70",
    bgClass: "bg-blue-500/[0.04] dark:bg-blue-500/[0.07]",
    titleClass: "text-blue-600 dark:text-blue-400",
  },
  TIP: {
    title: "Tip",
    icon: Lightbulb,
    borderClass: "border-l-emerald-500 dark:border-l-emerald-400 border-border/70",
    bgClass: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07]",
    titleClass: "text-emerald-600 dark:text-emerald-400",
  },
  IMPORTANT: {
    title: "Important",
    icon: Flame,
    borderClass: "border-l-violet-500 dark:border-l-violet-400 border-border/70",
    bgClass: "bg-violet-500/[0.04] dark:bg-violet-500/[0.07]",
    titleClass: "text-violet-600 dark:text-violet-400",
  },
  WARNING: {
    title: "Warning",
    icon: AlertTriangle,
    borderClass: "border-l-amber-500 dark:border-l-amber-400 border-border/70",
    bgClass: "bg-amber-500/[0.04] dark:bg-amber-500/[0.07]",
    titleClass: "text-amber-600 dark:text-amber-400",
  },
  CAUTION: {
    title: "Caution",
    icon: ShieldAlert,
    borderClass: "border-l-rose-500 dark:border-l-rose-400 border-border/70",
    bgClass: "bg-rose-500/[0.04] dark:bg-rose-500/[0.07]",
    titleClass: "text-rose-600 dark:text-rose-400",
  },
};

const CALLOUT_REGEX = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n)?/i;

/**
 * 递归从 ReactNode 中探测首个文本是否为 [!TYPE] 标记，并将其剥离
 */
function extractCallout(node: ReactNode): { type: CalloutType | null; cleanNode: ReactNode } {
  if (typeof node === "string") {
    const match = node.match(CALLOUT_REGEX);
    if (match) {
      const type = match[1].toUpperCase() as CalloutType;
      const stripped = node.replace(CALLOUT_REGEX, "").trimStart();
      return { type, cleanNode: stripped || null };
    }
    return { type: null, cleanNode: node };
  }

  if (Array.isArray(node)) {
    if (node.length === 0) return { type: null, cleanNode: node };
    const firstResult = extractCallout(node[0]);
    if (firstResult.type) {
      const nextChildren = [firstResult.cleanNode, ...node.slice(1)].filter(Boolean);
      return { type: firstResult.type, cleanNode: nextChildren };
    }
    return { type: null, cleanNode: node };
  }

  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
    const childResult = extractCallout(node.props.children);
    if (childResult.type) {
      return {
        type: childResult.type,
        cleanNode: React.cloneElement(node, {}, childResult.cleanNode),
      };
    }
  }

  return { type: null, cleanNode: node };
}

/**
 * 自定义 Markdown 引用块组件：
 * 支持 GitHub Flavored Callouts (Admonitions)：
 * > [!NOTE]
 * > [!TIP]
 * > [!IMPORTANT]
 * > [!WARNING]
 * > [!CAUTION]
 * 若不匹配则优雅降级为经典引用块。
 */
export function CalloutBlock({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"blockquote">) {
  const { type, cleanNode } = extractCallout(children);

  // 普通引用块降级
  if (!type || !CALLOUT_CONFIGS[type]) {
    return (
      <blockquote className={cn("my-6 border-l-2 border-border pl-4 italic", className)} {...props}>
        {children}
      </blockquote>
    );
  }

  const config = CALLOUT_CONFIGS[type];
  const Icon = config.icon;

  return (
    <div
      role="note"
      className={cn(
        "my-6 rounded-r-lg border border-l-4 p-4 shadow-sm transition-colors",
        config.borderClass,
        config.bgClass,
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 font-mono text-xs font-bold tracking-wider uppercase",
          config.titleClass,
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span>{config.title}</span>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-foreground/90 [&>p]:my-1.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
        {cleanNode}
      </div>
    </div>
  );
}
