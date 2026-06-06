import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { apiAuthPrefix, authRoutes, publicRoutes } from "./routes";

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

  // On an auth route (/login): always allow. We do NOT optimistically redirect
  // a "logged-in" user to the app here, because getSessionCookie only checks the
  // cookie's PRESENCE. If the cookie is present but the session is invalid, that
  // redirect loops: /home -> (app)/layout (no session) -> /login -> here -> /home
  // -> ... which Safari shows as "this page couldn't load". Post-login redirects
  // already send users to /home directly, so this is purely a safety removal.
  if (authRoutes.some((route) => pathname.startsWith(route))) {
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
  // Skip static assets, icons, and the web manifest; run on everything else.
  // (Without excluding manifest.webmanifest the proxy redirects it to /login and
  // the browser sees HTML -> "manifest is not valid JSON data".)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
