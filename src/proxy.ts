import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Next.js 16：middleware 已更名为 proxy。这里只做「乐观校验」，
// 真正的会话校验在 (admin)/layout、Server Action 与数据库层。
export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth?.user;

  if (!isLoggedIn && req.nextUrl.pathname.startsWith("/admin")) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("redirectTo", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
