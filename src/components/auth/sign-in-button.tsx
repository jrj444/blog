"use client";

import { useRef, useState } from "react";

// 直接表单 POST（与 Auth.js 内置登录页一致），规避 next-auth v5 beta 在
// Next.js 16 上 signIn server action 报 Configuration 的 bug。
export function SignInButton() {
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/csrf");
      const data = await res.json();
      setCsrfToken(data.csrfToken);
      requestAnimationFrame(() => formRef.current?.submit());
    } catch {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
      >
        {loading ? "跳转中…" : "使用 GitHub 登录"}
      </button>
      <form
        ref={formRef}
        action="/api/auth/signin/github"
        method="post"
        style={{ display: "none" }}
      >
        <input type="hidden" name="csrfToken" value={csrfToken} />
        <input type="hidden" name="callbackUrl" value="/auth/callback?next=/admin" />
      </form>
    </>
  );
}
