import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "vr_auth";

// 放行：登录页/登录接口/Next 内部/静态资源。
function isPublic(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/api/login") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  // 常见静态资源后缀
  if (/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|map|woff2?|ttf)$/i.test(pathname)) {
    return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const hasAuth = Boolean(req.cookies.get(AUTH_COOKIE)?.value);
  if (hasAuth) {
    return NextResponse.next();
  }

  // API 请求 → 401；页面请求 → 重定向登录页。
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // 排除 Next 内部与静态资源，减少中间件开销。
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
