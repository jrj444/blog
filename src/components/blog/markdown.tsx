import type { ReactNode } from "react";
import { MarkdownAsync } from "react-markdown";
import type { Element, Root } from "hast";
import { toString } from "hast-util-to-string";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { TocItem } from "@/lib/markdown-toc";
import { cn } from "@/lib/utils";
import { TableOfContents } from "./table-of-contents";

type MarkdownProps = {
  content: string;
  className?: string;
};

type MarkdownWithTocProps = MarkdownProps & {
  footer?: ReactNode;
};

function collectHeadings(headings: TocItem[]) {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;

      const id = node.properties.id;
      if (typeof id !== "string") return;

      headings.push({
        id,
        text: toString(node),
        level: node.tagName === "h2" ? 2 : 3,
      });
    });
  };
}

async function renderMarkdown(content: string, headings: TocItem[]) {
  return MarkdownAsync({
    children: content,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      collectHeadings(headings),
      [
        rehypePrettyCode,
        {
          theme: { light: "github-light", dark: "github-dark" },
          keepBackground: false,
          bypassInlineCode: true,
          defaultLang: "plaintext",
        },
      ],
    ],
  });
}

/**
 * 文章正文渲染:react-markdown + remark-gfm + rehype-pretty-code。
 * 服务端组件;异步 rehype 插件(shiki 高亮)通过 MarkdownAsync 处理。
 * 排版样式见 globals.css 中的 .markdown-body。
 */
export async function Markdown({ content, className }: MarkdownProps) {
  return <div className={cn("markdown-body", className)}>{await renderMarkdown(content, [])}</div>;
}

/**
 * 文章正文渲染：在 Markdown 服务端渲染过程中收集 H2/H3，生成目录。
 * 标题 id 由 rehype-slug 生成，因此目录链接与正文锚点天然一致。
 * footer 放进同一网格，让桌面目录可以一直吸顶到文章页脚结束。
 */
export async function MarkdownWithToc({ content, className, footer }: MarkdownWithTocProps) {
  const headings: TocItem[] = [];
  const rendered = await renderMarkdown(content, headings);
  const hasToc = headings.length >= 2;

  return (
    <div
      className={cn(hasToc && "xl:grid xl:grid-cols-[minmax(0,48rem)_15rem] xl:gap-12", className)}
    >
      {hasToc ? <TableOfContents items={headings} /> : null}
      <div className={cn("mx-auto max-w-3xl min-w-0 xl:mx-0", hasToc && "mt-8 xl:order-1 xl:mt-0")}>
        <div className="markdown-body">{rendered}</div>
        {footer}
      </div>
    </div>
  );
}
