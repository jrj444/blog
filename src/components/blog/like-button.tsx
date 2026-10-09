"use client";

import { useState, useTransition } from "react";
import { toggleLikeAction } from "@/app/(blog)/posts/[slug]/actions.ts";
import { cn } from "@/lib/utils.ts";
import { ThumbsUp } from "lucide-react";

type LikeButtonProps = {
  postId: string;
  initialCount: number;
  initialLiked: boolean;
  className?: string;
};

export function LikeButton({ postId, initialCount, initialLiked, className }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const prevLiked = liked;
    const prevCount = count;

    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setCount(prevCount + (nextLiked ? 1 : -1));

    startTransition(async () => {
      try {
        const result = await toggleLikeAction(postId);
        setLiked(result.liked);
        setCount(result.count);
      } catch (error) {
        console.error("点赞失败：", error);
        setLiked(prevLiked);
        setCount(prevCount);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      title={liked ? "取消" : "点赞"}
      aria-label={liked ? "取消" : "点赞"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-all",
        liked
          ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/50 hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      <ThumbsUp
        aria-hidden
        className={cn(
          "size-3.5 transition-transform active:scale-125",
          liked && "fill-rose-500 text-rose-500",
        )}
      />
      <span className="tabular-nums">{count > 0 ? count : "赞"}</span>
    </button>
  );
}
