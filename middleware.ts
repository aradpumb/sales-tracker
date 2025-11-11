import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    // Additional middleware logic can go here
    return;
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Return true if user should be allowed to access the page
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except login, register, and public assets
    '/((?!login|register|api/auth|_next/static|_next/image|favicon.ico|$).*)',
  ],
};
