"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// React 19 / Next.js 16 开发环境下，next-themes 用于防止首屏主题闪烁 (FOUC) 的内联 <script>
// 会被 React 19 误报为 "Encountered a script tag while rendering React component"（假阳性报错）。
// 在此拦截该特定开发期报错，生产环境不受影响。
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) {
      return;
    }
    originalError.apply(console, args);
  };
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
