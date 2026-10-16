"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Cookie, X } from "lucide-react";
import { PrivacyPolicyModal } from "./privacy-policy-modal";
import { Button } from "@/components/ui/button";

const CONSENT_STORAGE_KEY = "cookie_consent_v1";
const emptySubscribe = () => () => {};

export function CookieConsentBanner() {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!consent) {
      // 延迟 600ms 展示，避免与首屏加载动画冲突
      const timer = setTimeout(() => {
        setVisible(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, "accepted");
    } catch {
      // 隐私模式下可能会抛出异常，做静默兜底
    }
    setVisible(false);
  };

  // 服务端渲染或客户端已同意时不输出 DOM
  if (!isMounted || (!visible && !modalOpen)) {
    return null;
  }

  return (
    <>
      {visible && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
          <aside
            role="region"
            aria-label="Cookie 与隐私设置提示"
            className="animate-in fade-in-0 slide-in-from-bottom-4 pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-border/80 bg-background/95 p-3.5 shadow-2xl backdrop-blur-md duration-300 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-5"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Cookie className="size-4" aria-hidden />
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Cookie 与隐私知情：</span>
                本站仅使用轻量本地凭证记录主题偏好与文章点赞防刷，绝不采集个人追踪或画像数据。
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 pt-2.5 sm:border-t-0 sm:pt-0">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="cursor-pointer text-[11.5px] font-medium whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                了解详情
              </button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAccept}
                  className="h-7.5 cursor-pointer rounded-lg px-3.5 text-xs font-medium whitespace-nowrap shadow-xs"
                >
                  我知道了
                </Button>
                <button
                  type="button"
                  onClick={handleAccept}
                  aria-label="关闭提示"
                  className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <PrivacyPolicyModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
