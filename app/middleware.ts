import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    // Protect everything except login and NextAuth endpoints and static
    "/((?!login|api/auth|_next|favicon.ico|assets|public).*)",
  ],
};
