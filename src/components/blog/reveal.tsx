"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 滚动入场:IntersectionObserver 进入视口后加 .in(样式在 globals.css 的 .rv)。
 * 尊重 prefers-reduced-motion;并附带回退,超时自动显现。
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    const t = setTimeout(() => el.classList.add("in"), 900);

    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <div ref={ref} className={cn("rv", className)}>
      {children}
    </div>
  );
}
