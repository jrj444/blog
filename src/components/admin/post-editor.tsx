"use client";

import dynamic from "next/dynamic";

// 懒加载 + 关闭 SSR：编辑器只在浏览器里渲染，减小首屏体积、避免 SSR 报错
const MDXEditor = dynamic(() => import("./mdx-editor").then((m) => m.MDXEditor), { ssr: false });

export function PostEditor({
  markdown,
  onMarkdownChange,
  placeholder,
}: {
  markdown: string;
  onMarkdownChange: (markdown: string) => void;
  placeholder?: string;
}) {
  return <MDXEditor markdown={markdown} onChange={onMarkdownChange} placeholder={placeholder} />;
}
