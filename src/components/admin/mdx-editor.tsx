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
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export function MDXEditor({
  markdown,
  onChange,
  placeholder,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}) {
  return (
    <BaseMDXEditor
      markdown={markdown}
      onChange={(md) => onChange(md)}
      placeholder={placeholder}
      contentEditableClassName="mdx-editor-content min-h-[300px] outline-none"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        codeBlockPlugin(),
        tablePlugin(),
        imagePlugin(),
        toolbarPlugin({
          toolbarContents: () => (
            <>
              <UndoRedo />
              <BoldItalicUnderlineToggles />
              <BlockTypeSelect />
              <ListsToggle />
              <CreateLink />
            </>
          ),
        }),
        // Markdown 快捷转换(`## `→H2、`- `→列表、`> `→引用)。
        // 官方要求:必须放在依赖功能插件的后面(数组末尾),否则不生效。
        markdownShortcutPlugin(),
      ]}
    />
  );
}

export type { MDXEditorMethods };
