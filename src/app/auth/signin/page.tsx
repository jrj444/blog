import { SignInButton } from "@/components/auth/sign-in-button";
import { safeRedirectPath } from "@/lib/safe-redirect";

type SignInSearch = {
  error?: string | string[];
  /** proxy.ts 重定向过来时带的原始目标 */
  redirectTo?: string | string[];
  /** Auth.js 自带参数，作为兜底 */
  callbackUrl?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SignInSearch>;
}) {
  const { error, redirectTo, callbackUrl } = await searchParams;
  // 登录成功后回到被打断的页面；safeRedirectPath 会挡掉站外地址
  const next = safeRedirectPath(first(redirectTo) ?? first(callbackUrl));
  const errorMessage = first(error);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-lg border p-8 text-center">
        <h1 className="text-xl font-semibold">{"jiangruijian's blog Admin"}</h1>
        <p className="text-sm text-muted-foreground">仅管理员可登录。</p>
        {errorMessage ? (
          <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage === "AccessDenied"
              ? "该 GitHub 账号没有管理员权限。"
              : "登录失败，请重试。"}
          </p>
        ) : null}
        <SignInButton callbackUrl={next} />
      </div>
    </div>
  );
}
