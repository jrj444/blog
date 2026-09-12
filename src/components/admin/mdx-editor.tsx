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
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <BaseMDXEditor
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
            imagePlugin(),
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
