import { MarkdownAsync } from "react-markdown";
import rehypePrettyCode from "rehype-pretty-code";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownProps = {
  content: string;
  className?: string;
};

/**
 * 文章正文渲染:react-markdown + remark-gfm + rehype-pretty-code。
 * 服务端组件;异步 rehype 插件(shiki 高亮)通过 MarkdownAsync 处理。
 * 排版样式见 globals.css 中的 .markdown-body。
 */
export async function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn("markdown-body", className)}>
      {await MarkdownAsync({
        children: content,
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          [
            rehypePrettyCode,
            {
              theme: "github-light",
              keepBackground: false,
              bypassInlineCode: true,
              defaultLang: "plaintext",
            },
          ],
        ],
      })}
    </div>
  );
}
