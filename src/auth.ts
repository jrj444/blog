import NextAuth, { customFetch } from "next-auth";
import GitHub from "next-auth/providers/github";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// 境内走代理访问 GitHub 时，OAuth 端点（token 交换 / userinfo）经常被间歇性
// 重置(RST)或超时。这里对这类「瞬时网络错误」自动重试，避免回调直接报 Configuration。
const RETRIABLE = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ENETUNREACH",
]);

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastErr = e;
      const err = e as { cause?: { code?: string }; code?: string };
      const code = err?.cause?.code ?? err?.code;
      if (!code || !RETRIABLE.has(code)) throw e;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

const githubProvider = GitHub({
  [customFetch]: resilientFetch,
});

export const { handlers, auth } = NextAuth({
  trustHost: true,
  providers: [githubProvider],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    // 只放行管理员邮箱；其他 GitHub 用户直接拒绝
    async signIn({ user, account }) {
      if (account?.provider !== "github") return false;
      if (!user?.email) return false;
      return ADMIN_EMAILS.includes(user.email.toLowerCase());
    },
  },
});

// 后端兜底：Server Component / Server Action / Route Handler 里用
export async function isAdmin() {
  const session = await auth();
  if (!session?.user?.email) return false;
  return ADMIN_EMAILS.includes(session.user.email.toLowerCase());
}
