"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Reply,
  X,
} from "lucide-react";
import type { CommentThreadItem } from "@/lib/db/queries";
import { addCommentAction, type CommentActionState } from "@/app/(blog)/posts/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateShort } from "@/lib/format-date";
import { siteConfig } from "@/lib/site";

type CommentsProps = {
  postId: string;
  initialThreads: CommentThreadItem[];
  initialTotalCount: number;
};

type ReplyingTarget = {
  parentId: string;
  replyToId: string | null;
  targetAuthor: string;
} | null;

const STORAGE_NAME_KEY = "blog_comment_author_name";
const STORAGE_URL_KEY = "blog_comment_author_url";

export function Comments({ postId, initialThreads, initialTotalCount }: CommentsProps) {
  const [replyingTo, setReplyingTo] = useState<ReplyingTarget>(null);
  const [authorName, setAuthorName] = useState("");
  const [authorUrl, setAuthorUrl] = useState("");
  const [content, setContent] = useState("");

  const formRef = useRef<HTMLFormElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);

  // 1. 初始化读取记住的昵称与主页
  useEffect(() => {
    try {
      const savedName = localStorage.getItem(STORAGE_NAME_KEY);
      const savedUrl = localStorage.getItem(STORAGE_URL_KEY);
      startTransition(() => {
        if (savedName) setAuthorName(savedName);
        if (savedUrl) setAuthorUrl(savedUrl);
      });
    } catch {
      // 容错：处理无权限访问 localStorage 的特殊隐私模式
    }
  }, []);

  // 2. 表单提交状态管理 (React 19 useActionState)
  const [state, formAction, isPending] = useActionState<CommentActionState, FormData>(
    async (prev, formData) => {
      const result = await addCommentAction(prev, formData);
      if (result?.success) {
        // 成功后记住昵称与网站，清空正文并重置回复状态
        try {
          localStorage.setItem(STORAGE_NAME_KEY, authorName);
          if (authorUrl) {
            localStorage.setItem(STORAGE_URL_KEY, authorUrl);
          } else {
            localStorage.removeItem(STORAGE_URL_KEY);
          }
        } catch {
          // 容错
        }
        setContent("");
        setReplyingTo(null);
      }
      return result;
    },
    null,
  );

  // 3. 点击「回复」时的联动：更新状态、滚动并聚焦输入框
  const handleStartReply = (target: ReplyingTarget) => {
    setReplyingTo(target);
    contentInputRef.current?.focus();
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  return (
    <section className="mt-12 space-y-8 border-t border-border pt-8" aria-label="文章评论区">
      {/* 头部标题与统计 */}
      <div className="flex items-center gap-2">
        <MessageSquare className="size-5 text-muted-foreground" />
        <h2 className="font-serif text-xl font-bold tracking-tight">评论</h2>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          ({initialTotalCount})
        </span>
      </div>

      {/* 评论发表表单 */}
      <form
        ref={formRef}
        action={formAction}
        className="rounded-xl border border-border bg-card/60 p-4 shadow-2xs backdrop-blur-xs sm:p-5"
      >
        {/* 隐藏字段：文章 ID 与 知乎式回复链路参数 */}
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="parentId" value={replyingTo?.parentId ?? ""} />
        <input type="hidden" name="replyToId" value={replyingTo?.replyToId ?? ""} />

        {/* 蜜罐字段（防脚本爬虫，对真实用户不可见） */}
        <input
          name="website"
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          className="sr-only hidden"
        />

        {/* 回复目标状态条 */}
        {replyingTo && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CornerDownRight className="size-3.5 text-primary" />
              <span>
                正在回复{" "}
                <strong className="font-semibold text-foreground">
                  @{replyingTo.targetAuthor}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              <span>取消</span>
            </button>
          </div>
        )}

        {/* 基础信息输入（昵称与主页） */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Input
              name="authorName"
              placeholder="昵称 *"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              required
              maxLength={30}
              disabled={isPending}
              className="h-9 text-xs"
            />
            {state?.error?.authorName && (
              <p className="mt-1 text-[11px] text-destructive">{state.error.authorName[0]}</p>
            )}
          </div>
          <div>
            <Input
              name="authorUrl"
              placeholder="网站 (选填，https://...)"
              type="url"
              value={authorUrl}
              onChange={(e) => setAuthorUrl(e.target.value)}
              maxLength={200}
              disabled={isPending}
              className="h-9 text-xs"
            />
            {state?.error?.authorUrl && (
              <p className="mt-1 text-[11px] text-destructive">{state.error.authorUrl[0]}</p>
            )}
          </div>
        </div>

        {/* 评论内容文本域 */}
        <div className="mt-3">
          <Textarea
            ref={contentInputRef}
            name="content"
            placeholder={
              replyingTo ? `回复 @${replyingTo.targetAuthor} 的想法...` : "写下你的想法 (纯文本)..."
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={3}
            maxLength={1000}
            disabled={isPending}
            className="resize-y text-xs"
          />
          {state?.error?.content && (
            <p className="mt-1 text-[11px] text-destructive">{state.error.content[0]}</p>
          )}
        </div>

        {/* 提交反馈提示与提交按钮 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {state?.success && (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                🎉 {state.message || "评论已提交，博主审核通过后显示"}
              </span>
            )}
            {!state?.success && state?.message && (
              <span className="font-medium text-destructive">{state.message}</span>
            )}
          </div>

          <Button type="submit" size="sm" disabled={isPending} className="gap-1.5 px-4 text-xs">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span>{isPending ? "正在提交..." : replyingTo ? "发表回复" : "发表评论"}</span>
          </Button>
        </div>
      </form>

      {/* 评论列表区域 */}
      <div className="space-y-6">
        {initialThreads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground">
            暂无评论，来发表第一条见解吧~
          </div>
        ) : (
          initialThreads.map((thread) => {
            const isRootAuthorAdmin = thread.authorName === siteConfig.name;

            return (
              <div
                key={thread.id}
                className="rounded-xl border border-border bg-card/40 p-4 transition-colors sm:p-5"
              >
                {/* 1. 主楼根评论卡片 */}
                <div className="flex items-start gap-3">
                  {/* 首字头像徽章 */}
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {thread.authorName.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* 作者与发布时间 */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold text-foreground">{thread.authorName}</span>

                      {/* 博主徽章 */}
                      {isRootAuthorAdmin && (
                        <span className="py-0.2 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                          博主
                        </span>
                      )}

                      {/* 外链安全跳转 */}
                      {thread.authorUrl && (
                        <a
                          href={thread.authorUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow ugc"
                          title={thread.authorUrl}
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}

                      <span className="text-muted-foreground/60" aria-hidden>
                        ·
                      </span>
                      <time className="font-mono text-[11px] text-muted-foreground">
                        {formatDateShort(thread.createdAt)}
                      </time>
                    </div>

                    {/* 正文 (纯文本安全渲染，防 XSS 与超长单词换行溢出) */}
                    <p className="mt-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground/90 sm:text-sm">
                      {thread.content}
                    </p>

                    {/* 回复按钮 */}
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleStartReply({
                            parentId: thread.id,
                            replyToId: null,
                            targetAuthor: thread.authorName,
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Reply className="size-3" />
                        <span>回复</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. 知乎式楼内回复流 (若有跟评) */}
                {thread.replies.length > 0 && (
                  <div className="mt-3.5 space-y-3 rounded-lg border border-border/70 bg-muted/40 p-3.5 sm:ml-11">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      共 {thread.replies.length} 条回复
                    </div>

                    <div className="space-y-3 divide-y divide-border/50">
                      {thread.replies.map((reply) => {
                        const isReplyAuthorAdmin = reply.authorName === siteConfig.name;

                        return (
                          <div key={reply.id} className="pt-3 first:pt-0">
                            {/* 子回复作者头部：知乎式 A ▶ B */}
                            <div className="flex flex-wrap items-center gap-1 text-xs">
                              <span className="font-medium text-foreground">
                                {reply.authorName}
                              </span>

                              {isReplyAuthorAdmin && (
                                <span className="py-0.2 rounded bg-primary/10 px-1 text-[9.5px] font-medium text-primary">
                                  博主
                                </span>
                              )}

                              {reply.authorUrl && (
                                <a
                                  href={reply.authorUrl}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow ugc"
                                  title={reply.authorUrl}
                                  className="text-muted-foreground transition-colors hover:text-primary"
                                >
                                  <ExternalLink className="size-2.5" />
                                </a>
                              )}

                              {/* 二级回复上下文标识 */}
                              {reply.replyToAuthorName && (
                                <>
                                  <ChevronRight className="size-3 text-muted-foreground/70" />
                                  <span className="font-medium text-muted-foreground">
                                    {reply.replyToAuthorName}
                                  </span>
                                </>
                              )}

                              <span className="text-muted-foreground/60" aria-hidden>
                                ·
                              </span>
                              <time className="font-mono text-[10.5px] text-muted-foreground">
                                {formatDateShort(reply.createdAt)}
                              </time>
                            </div>

                            {/* 子回复内容 */}
                            <p className="mt-1 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
                              {reply.content}
                            </p>

                            {/* 子回复条目下的「回复」按钮：同楼回复 */}
                            <div className="mt-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartReply({
                                    parentId: thread.id,
                                    replyToId: reply.id,
                                    targetAuthor: reply.authorName,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Reply className="size-2.5" />
                                <span>回复</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
