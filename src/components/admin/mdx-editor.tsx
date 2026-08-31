"use client";

import {
  MDXEditor as BaseMDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
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
      contentEditableClassName="min-h-[300px] outline-none"
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
      ]}
    />
  );
}

export type { MDXEditorMethods };
