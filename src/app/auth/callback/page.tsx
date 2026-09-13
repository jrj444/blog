import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";

type CallbackSearch = { next?: string | string[] };

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<CallbackSearch>;
}) {
  const { next } = await searchParams;
  const target = safeRedirectPath(Array.isArray(next) ? next[0] : next);

  if (await isAdmin()) {
    redirect(target);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-4 rounded-lg border p-8 text-center">
        <h1 className="text-lg font-semibold">无法访问管理后台</h1>
        <p className="text-sm text-muted-foreground">
          仅管理员账号（ADMIN_EMAILS 配置的邮箱）可登录。请使用管理员 GitHub 账号重新登录。
        </p>
        <Link
          href="/auth/signin"
          className="inline-block rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          重新登录
        </Link>
      </div>
    </div>
  );
}
