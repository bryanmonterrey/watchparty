import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { apiAuthPrefix, authRoutes, publicRoutes, DEFAULT_LOGIN_REDIRECT } from "./routes";

// Next.js 16 edge proxy (formerly middleware). Optimistic edge auth gate:
// checks only for the presence of the session cookie (the real validation
// stays in (app)/layout via getServerSession). Ported from sidebar and adapted
// to watchparty's routes (/login, /home).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = getSessionCookie(request);

  // Always allow better-auth + internal API routes (tRPC, webhooks).
  if (pathname.startsWith(apiAuthPrefix) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // On an auth route (/login): a signed-in user is bounced into the app.
  if (authRoutes.some((route) => pathname.startsWith(route))) {
    if (session) return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, request.url));
    return NextResponse.next();
  }

  // Everything else that isn't explicitly public requires a session.
  const isPublic = publicRoutes.includes(pathname);
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and image files; run on everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
