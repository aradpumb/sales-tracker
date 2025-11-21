import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token: any = (req as any).nextauth?.token;
    const role = token?.role ?? "USER";

    // Allow everything for ADMIN
    if (role === "ADMIN") {
      return NextResponse.next();
    }

    // USER role: allow only /sales and /performance (+ public assets and auth/api)
    const { pathname } = req.nextUrl;

    const isAllowedForUser =
      pathname.startsWith("/sales") ||
      pathname.startsWith("/performance") ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/_next") ||
      pathname === "/favicon.ico" ||
      pathname === "/";

    if (!isAllowedForUser) {
      const url = req.nextUrl.clone();
      url.pathname = "/performance";
      url.search = ""; // drop query on redirect
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Only require the user to be authenticated; role-based routing handled above
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except login, register, auth endpoints and public assets
    "/((?!login|register|api/auth|_next/static|_next/image|favicon.ico|$).*)",
  ],
};
