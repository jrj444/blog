"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeTagKey } from "@/lib/tags/normalize";
import type { TagOption, TagSummaryWithCount } from "@/lib/db/queries";

/**
 * 已选项（§8.2）：{ id, name, slug, isActive } = 已有标签（含停用回显），
 * { name } = 待创建的新名称——落库发生在提交文章时，由服务端归一化去重后解析。
 */
type SelectedTag = TagOption | { name: string };

type TagSelectProps = {
  /** 候选标签：仅启用中，服务端已按「已发布文章数倒序、名称」排序（§8.1） */
  candidates: TagSummaryWithCount[];
  /** 编辑回显：含停用标签（以「已停用」标记展示，可移除；候选列表不含停用标签，移除后加不回来） */
  defaultTags: TagOption[];
  maxTags?: number;
};

/**
 * 文章编辑器的标签选择组件（§8.1 交互契约）：
 * 聚焦展开候选（仅启用标签，展示名称与文章数），关键词实时过滤（name/slug 包含匹配），
 * 键盘 ↑↓ 高亮、Enter 选中或创建、Backspace（空输入）移除最后一个、Esc 收起；
 * 输入与候选的 normalized_key 完全一致时 Enter 直接选中已有标签，不进创建分支；
 * 无精确匹配时列表末尾固定显示「创建 "xxx"」，选中仅本地记为待创建（{name}）。
 * 选中项写入隐藏字段 tags（JSON 数组：[{id}] / [{name}]），顺序即 post_tags.position。
 */
export function TagSelect({ candidates, defaultTags, maxTags = 10 }: TagSelectProps) {
  const [selected, setSelected] = useState<SelectedTag[]>(defaultTags);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const queryKey = normalizeTagKey(query.trim());
  const selectedIds = useMemo(
    () => new Set(selected.flatMap((entry) => ("id" in entry ? [entry.id] : []))),
    [selected],
  );
  const selectedKeys = useMemo(
    () => new Set(selected.map((entry) => normalizeTagKey(entry.name))),
    [selected],
  );

  // 关键词实时过滤：匹配 name / slug / normalized_key（name 归一化后包含匹配即可，§8.1）
  const selectable = useMemo(
    () =>
      candidates.filter(
        (tag) =>
          !selectedIds.has(tag.id) &&
          (!queryKey ||
            normalizeTagKey(tag.name).includes(queryKey) ||
            tag.slug.toLowerCase().includes(queryKey)),
      ),
    [candidates, queryKey, selectedIds],
  );

  // 与某候选的 normalized_key 完全一致时不进创建分支（去重的第一道防线，§8.1）
  const exact = queryKey
    ? candidates.find((tag) => normalizeTagKey(tag.name) === queryKey)
    : undefined;
  const createAvailable = Boolean(queryKey) && !exact && !selectedKeys.has(queryKey);
  const itemCount = selectable.length + (createAvailable ? 1 : 0);
  const atMax = selected.length >= maxTags;

  const payload = JSON.stringify(
    selected.map((entry) => ("id" in entry ? { id: entry.id } : { name: entry.name })),
  );

  // React 19 不同步受控 value 到 hidden input（同 post-form 的 contentRef 处理），直接写 DOM
  useEffect(() => {
    if (hiddenRef.current) hiddenRef.current.value = payload;
  }, [payload]);

  function addExisting(tag: TagSummaryWithCount) {
    if (atMax) {
      setHint(`最多 ${maxTags} 个标签`);
      return;
    }
    setHint(null);
    setSelected((prev) => [
      ...prev,
      { id: tag.id, name: tag.name, slug: tag.slug, isActive: true },
    ]);
    setQuery("");
    setHighlight(-1);
  }

  function addNew() {
    if (atMax) {
      setHint(`最多 ${maxTags} 个标签`);
      return;
    }
    setHint(null);
    setSelected((prev) => [...prev, { name: query.trim() }]);
    setQuery("");
    setHighlight(-1);
  }

  function removeAt(index: number) {
    setSelected((prev) => prev.filter((_, i) => i !== index));
    setHint(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((prev) => (itemCount === 0 ? -1 : Math.min(prev + 1, itemCount - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlight >= 0 && highlight < selectable.length) {
        addExisting(selectable[highlight]);
      } else if (exact && !selectedIds.has(exact.id)) {
        addExisting(exact);
      } else if (createAvailable && (highlight === selectable.length || highlight < 0)) {
        addNew();
      }
    } else if (event.key === "Backspace" && query === "" && selected.length > 0) {
      removeAt(selected.length - 1);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const message = hint ?? (atMax ? `最多 ${maxTags} 个标签` : null);

  return (
    <div className="relative space-y-2">
      <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm">
        {selected.map((entry, index) => {
          const inactive = "id" in entry && !entry.isActive;
          return (
            <span
              key={"id" in entry ? entry.id : `new:${normalizeTagKey(entry.name)}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                inactive
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-border bg-muted/40 text-foreground",
              )}
            >
              #{entry.name}
              {inactive && <span className="text-[10px]">已停用</span>}
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`移除标签 ${entry.name}`}
                className="rounded-full p-0.5 transition-colors hover:bg-foreground/10"
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(-1);
            setOpen(true);
            setHint(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? "选择已有标签，或输入新名称后回车创建" : undefined}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlight >= 0
              ? highlight < selectable.length
                ? `${listboxId}-${selectable[highlight].id}`
                : `${listboxId}-create`
              : undefined
          }
          className="min-w-32 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* 真正提交给 Server Action 的值：JSON 数组字符串，形状由服务端 zod 校验（§8.2） */}
      <input type="hidden" name="tags" ref={hiddenRef} />

      {open && itemCount > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-md"
        >
          {selectable.map((tag, index) => (
            <li
              key={tag.id}
              id={`${listboxId}-${tag.id}`}
              role="option"
              aria-selected={false}
              // 按下鼠标不转移焦点，输入框不 blur，下拉才不会在 click 前收起
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addExisting(tag)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                highlight === index && "bg-accent text-accent-foreground",
              )}
            >
              <span>#{tag.name}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground">{tag.count} 篇</span>
            </li>
          ))}
          {createAvailable && (
            <li
              id={`${listboxId}-create`}
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={addNew}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-sm",
                highlight === selectable.length && "bg-accent text-accent-foreground",
              )}
            >
              <span>
                创建 <span className="font-medium">“{query.trim()}”</span>
              </span>
              <span className="text-[10.5px] text-muted-foreground">保存文章时入库</span>
            </li>
          )}
        </ul>
      )}

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
