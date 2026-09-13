import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Next.js 16：middleware 已更名为 proxy。这里只做「乐观校验」，
// 真正的会话校验在 (admin)/layout、Server Action 与数据库层。
export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth?.user;

  if (!isLoggedIn && req.nextUrl.pathname.startsWith("/admin")) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    // 带上原始路径 + 查询串，登录后能回到被打断的地方（登录页会做站内校验）
    url.search = "";
    url.searchParams.set("redirectTo", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
