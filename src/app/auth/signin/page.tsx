import { SignInButton } from "@/components/auth/sign-in-button";

type SignInSearch = { error?: string };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SignInSearch>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4 rounded-lg border p-8 text-center">
        <h1 className="text-xl font-semibold">{"jiangruijian's blog Admin"}</h1>
        <p className="text-sm text-muted-foreground">仅管理员可登录。</p>
        {error ? (
          <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error === "AccessDenied" ? "该 GitHub 账号没有管理员权限。" : "登录失败，请重试。"}
          </p>
        ) : null}
        <SignInButton />
      </div>
    </div>
  );
}
