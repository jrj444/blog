"use client";

import { useEffect, useState } from "react";
import { ChevronDown, List } from "lucide-react";
import type { TocItem } from "@/lib/markdown-toc";
import { cn } from "@/lib/utils";

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
              onClick={(event) => {
                onSelect(item.id);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
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
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

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
        setActiveId(headings.at(-1)?.id ?? "");
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

      setActiveId(current);
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
  }, [items]);

  return (
    <div
      className={cn("sticky top-[4.5rem] z-40 min-w-0 xl:static xl:z-auto xl:order-2", className)}
    >
      <details className="group overflow-hidden rounded-xl border border-border bg-background shadow-sm open:fixed open:inset-x-4 open:top-[4.5rem] open:z-[60] open:shadow-lg xl:hidden">
        <summary className="flex list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <List aria-hidden className="size-4 text-primary" />
          本文目录
          <ChevronDown
            aria-hidden
            className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <nav aria-label="文章目录" className="border-t border-border px-4 py-3">
          <TocList items={items} activeId={activeId} onSelect={setActiveId} />
        </nav>
      </details>

      <nav aria-label="文章目录" className="hidden xl:sticky xl:top-24 xl:block">
        <div>
          <p className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
            <List aria-hidden className="size-3.5" />
            本文目录
          </p>
          <TocList items={items} activeId={activeId} onSelect={setActiveId} className="mt-3 pr-2" />
        </div>
      </nav>
    </div>
  );
}
