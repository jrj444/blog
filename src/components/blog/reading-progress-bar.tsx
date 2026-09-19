"use client";

import { useEffect, useState } from "react";

/**
 * 顶栏阅读进度指示条：
 * 吸附在顶部 Header 底沿，基于 scaleX 硬件加速跟随页面滚动实时反映阅读进度。
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const docElement = document.documentElement;
          const body = document.body;
          const scrollTop = window.scrollY || docElement.scrollTop || body.scrollTop || 0;
          const scrollHeight =
            Math.max(
              docElement.scrollHeight,
              body.scrollHeight,
              docElement.offsetHeight,
              body.offsetHeight,
            ) - window.innerHeight;

          if (scrollHeight <= 0) {
            setProgress(0);
          } else {
            const p = Math.min(1, Math.max(0, scrollTop / scrollHeight));
            setProgress(p);
          }
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

  if (progress <= 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 bottom-0 left-0 z-50 h-[2px] w-full overflow-hidden bg-transparent"
    >
      <div
        className="h-full w-full origin-left bg-foreground shadow-[0_0_8px_hsl(var(--foreground)/0.4)] transition-transform duration-75 ease-out"
        style={{
          transform: `scaleX(${progress})`,
        }}
      />
    </div>
  );
}
