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

import { CodeBlock } from "./code-block";

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

/** 从 <code> 节点的 meta 或类名中提取文件名、行号等元信息 */
function parseCodeMeta(codeChild: Element): { title?: string; showLineNumbers?: boolean } {
  const data = codeChild.data as Record<string, unknown> | undefined;
  const rawMeta =
    typeof data?.meta === "string"
      ? data.meta
      : typeof codeChild.properties?.metastring === "string"
        ? (codeChild.properties.metastring as string)
        : "";

  let title: string | undefined;
  let showLineNumbers = false;

  // 1. 匹配 title="..." 或 title='...' 或 title=...
  const titleMatch = rawMeta.match(/title=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  if (titleMatch) {
    title = titleMatch[1] || titleMatch[2] || titleMatch[3];
  }

  // 2. 匹配 :filename 格式，例如 language-ts:src/lib/db.ts
  if (!title && Array.isArray(codeChild.properties?.className)) {
    for (const cls of codeChild.properties.className) {
      if (typeof cls === "string") {
        const colonMatch = cls.match(/^language-[^:]+:(.+)$/);
        if (colonMatch) {
          title = colonMatch[1];
          break;
        }
      }
    }
  }

  // 3. 检查是否有 showLineNumbers 声明
  if (rawMeta.includes("showLineNumbers") || rawMeta.includes("lineNumbers")) {
    showLineNumbers = true;
  }

  return { title, showLineNumbers };
}

/** 在 rehype-pretty-code 语法高亮前提取纯文本代码与元数据，挂载到 pre 上供 CodeBlock 使用 */
function extractRawCode() {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;

      const codeChild = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (codeChild) {
        const rawCode = toString(codeChild);
        const { title, showLineNumbers } = parseCodeMeta(codeChild);
        const lineCount = rawCode ? rawCode.split("\n").length : 0;

        node.properties = node.properties || {};
        node.properties["data-raw"] = rawCode;
        if (title) {
          node.properties["data-title"] = title;
        }
        if (showLineNumbers) {
          node.properties["data-show-lines"] = "true";
        }
        node.properties["data-line-count"] = String(lineCount);
      }
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
      extractRawCode(),
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
    components: {
      pre: CodeBlock,
    },
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
