"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import type { TocItem } from "@/lib/markdown-toc";
import { cn } from "@/lib/utils";
import { RegisterToc, useFloatingActions } from "./floating-actions-context";

type TableOfContentsProps = {
  items: TocItem[];
  className?: string;
};

type TocListProps = {
  items: TocItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
};

function TocList({ items, activeId, onSelect, className }: TocListProps) {
  return (
    <ol className={cn("border-l border-border", className)}>
      {items.map((item) => {
        const active = item.id === activeId;

        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active ? "location" : undefined}
              onClick={() => onSelect(item.id)}
              className={cn(
                "-ml-px block border-l-2 py-1.5 text-[12px] leading-5 transition-colors",
                item.level === 3 ? "pl-6" : "pl-3",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {item.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function TableOfContents({ items, className }: TableOfContentsProps) {
  const { activeHeadingId, setActiveHeadingId } = useFloatingActions();
  const [localActiveId, setLocalActiveId] = useState(items[0]?.id ?? "");

  const activeId = activeHeadingId || localActiveId;

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => heading !== null);

    if (headings.length === 0) return;

    let frame = 0;

    const updateActiveHeading = () => {
      const pageBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;

      if (pageBottom) {
        const lastId = headings.at(-1)?.id ?? "";
        setLocalActiveId(lastId);
        setActiveHeadingId(lastId);
        return;
      }

      let current = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 104) {
          current = heading.id;
        } else {
          break;
        }
      }

      setLocalActiveId(current);
      setActiveHeadingId(current);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActiveHeading);
    };

    updateActiveHeading();

    const observer = new IntersectionObserver(scheduleUpdate, {
      rootMargin: "-88px 0px -70% 0px",
      threshold: [0, 1],
    });

    for (const heading of headings) observer.observe(heading);

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
    };
  }, [items, setActiveHeadingId]);

  return (
    <>
      {/* 向全局浮动岛注册大纲 items */}
      <RegisterToc items={items} />

      {/* 桌面端保留优雅的粘性目录，移动端已交由全局右下角抽屉浮动岛接管 */}
      <div className={cn("hidden xl:static xl:order-2 xl:block xl:min-w-0", className)}>
        <nav aria-label="文章目录" className="xl:sticky xl:top-24">
          <div>
            <p className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
              <List aria-hidden className="size-3.5" />
              本文目录
            </p>
            <TocList
              items={items}
              activeId={activeId}
              onSelect={(id) => {
                setLocalActiveId(id);
                setActiveHeadingId(id);
              }}
              className="mt-3 pr-2"
            />
          </div>
        </nav>
      </div>
    </>
  );
}
