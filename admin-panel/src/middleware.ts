import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_AUTH_COOKIE,
  getAdminPassword,
  isValidAuthCookie,
} from "@/lib/adminAuth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const configuredPassword = getAdminPassword();

  if (!configuredPassword) {
    return NextResponse.json(
      { error: "ADMIN_PANEL_PASSWORD is not configured" },
      { status: 500 }
    );
  }

  const cookiePassword = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
  const hasValidCookie = isValidAuthCookie(cookiePassword);

  if (pathname === "/login" || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (!hasValidCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"],
};
