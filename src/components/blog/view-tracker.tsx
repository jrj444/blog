"use client";

import { useEffect, useRef } from "react";
import { trackView } from "@/app/(blog)/posts/[slug]/actions";

/**
 * 阅读量计数:页面真实打开后(客户端 mount)计数一次。
 * - useRef 防 React StrictMode 双执行
 * - sessionStorage 防同一会话内重复计数
 * 不渲染任何 UI。
 */
export function ViewTracker({ postId }: { postId: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const key = `viewed:${postId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage 不可用(隐私模式等)时仍计数一次
    }
    void trackView(postId);
  }, [postId]);

  return null;
}
