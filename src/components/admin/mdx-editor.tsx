"use client";

import {
  MDXEditor as BaseMDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  markdownShortcutPlugin,
  codeBlockPlugin,
  tablePlugin,
  imagePlugin,
  toolbarPlugin,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  CodeToggle,
  InsertCodeBlock,
  InsertTable,
  InsertImage,
  InsertThematicBreak,
  CodeMirrorEditor,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { readingTime } from "@/lib/reading-time";
import { compressImage } from "@/lib/compress-image";
import { createCoverUploadAction } from "@/app/admin/posts/upload-action";

async function handleImageUpload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }

  // 1) 浏览器端 WebP 阶梯压缩
  const upload = await compressImage(file);

  // 2) 向服务端申请 R2 直传凭证（存入 posts/ 目录）
  const target = await createCoverUploadAction({
    type: upload.type,
    size: upload.size,
    prefix: "posts",
  });

  if (!target.ok) {
    throw new Error(target.error);
  }

  // 3) 直传到 R2
  const response = await fetch(target.uploadUrl, {
    method: "PUT",
    headers: target.headers,
    body: upload,
  });

  if (!response.ok) {
    throw new Error(`上传图片失败（HTTP ${response.status}）`);
  }

  return target.publicUrl;
}

export function MDXEditor({
  markdown,
  onChange,
  placeholder,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}) {
  const { chars, minutes } = readingTime(markdown);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <BaseMDXEditor
          className="mdx-editor-surface"
          markdown={markdown}
          onChange={(md) => onChange(md)}
          placeholder={placeholder}
          contentEditableClassName="mdx-editor-content min-h-[320px] outline-none"
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            linkPlugin(),
            linkDialogPlugin(),

            codeBlockPlugin({
              defaultCodeBlockLanguage: "js",
              codeBlockEditorDescriptors: [
                { priority: 0, match: () => true, Editor: CodeMirrorEditor },
              ],
            }),
            tablePlugin(),
            imagePlugin({
              imageUploadHandler: handleImageUpload,
            }),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <DiffSourceToggleWrapper
                    options={["rich-text", "source"]}
                    SourceToolbar={
                      <span className="px-2 text-xs text-muted-foreground">Markdown 源码模式</span>
                    }
                  >
                    <UndoRedo />
                    <BoldItalicUnderlineToggles />
                    <CodeToggle />
                    <BlockTypeSelect />
                    <ListsToggle />
                    <CreateLink />
                    <InsertImage />
                    <InsertCodeBlock />
                    <InsertTable />
                    <InsertThematicBreak />
                  </DiffSourceToggleWrapper>
                </>
              ),
            }),
            diffSourcePlugin(),
            markdownShortcutPlugin(),
          ]}
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        <span>{chars.toLocaleString()} 字</span>
        <span aria-hidden className="size-[3px] rounded-full bg-border" />
        <span>约 {minutes} 分钟</span>
      </div>
    </div>
  );
}

export type { MDXEditorMethods };
