"use client";

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import type { TocItem } from "@/lib/markdown-toc";

interface FloatingActionsContextValue {
  tocItems: TocItem[];
  setTocItems: (items: TocItem[]) => void;
  activeHeadingId: string;
  setActiveHeadingId: (id: string) => void;
}

const FloatingActionsContext = createContext<FloatingActionsContextValue | null>(null);

export function FloatingActionsProvider({ children }: { children: ReactNode }) {
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");

  const value = useMemo(
    () => ({
      tocItems,
      setTocItems,
      activeHeadingId,
      setActiveHeadingId,
    }),
    [tocItems, activeHeadingId],
  );

  return (
    <FloatingActionsContext.Provider value={value}>{children}</FloatingActionsContext.Provider>
  );
}

export function useFloatingActions() {
  const context = useContext(FloatingActionsContext);
  if (!context) {
    throw new Error("useFloatingActions must be used within a FloatingActionsProvider");
  }
  return context;
}

/**
 * 声明式注册组件：
 * 文章页渲染时向全局上下文注册大纲，页面卸载或路由切换时自动清理。
 */
export function RegisterToc({ items }: { items: TocItem[] }) {
  const { setTocItems } = useFloatingActions();

  useEffect(() => {
    setTocItems(items);
    return () => {
      setTocItems([]);
    };
  }, [items, setTocItems]);

  return null;
}
