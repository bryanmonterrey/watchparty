import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { apiAuthPrefix, authRoutes, publicRoutes, publicPrefixes } from "./routes";
import { allowsAnonymous } from "./lib/auth/public-browsing";

// Edge middleware. Next 16 deprecated `middleware` in favor of `proxy`, BUT
// `proxy` is locked to the Node.js runtime, which OpenNext/Cloudflare Workers
// does not support — only edge middleware runs there. So we deliberately keep
// the `middleware` convention to stay on the edge runtime (the cookie-only auth
// gate below is edge-safe; this is how it ran in sidebar). Revisit when Next
// ships an edge option for `proxy`.
//
// DO NOT run the codemod the build now offers. As of 16.3 Next prints
// `npx @next/codemod middleware-to-proxy .` inside the deprecation warning on
// every dev/build run, and 16.3 ALSO deprecates the edge runtime — so Next is
// deprecating both sides of this fork with no third option. Taking the codemod
// produces a `proxy.ts` that OpenNext refuses to deploy
// (opennextjs-cloudflare#1277: "only edge middleware is supported"), i.e. a
// broken worker, not a migration. The warning stays until that issue closes.
//
// The 2026-08-06 cross-subdomain cookie change (lib/auth/server.ts,
// crossSubDomainCookies) left every browser that signed in BEFORE it holding
// the session cookie twice: the old host-only identity plus the new
// .watchparty.xyz one — same name, two cookies. RFC 6265 leaves the send order
// effectively unspecified across browsers, and better-auth's parser takes the
// last occurrence, so a browser that happens to send the fresh cookie first
// makes every request read the STALE token — the server answers "no session"
// cleanly and the app shows Sign In no matter how often you refresh.
//
// Deleting a cookie targets (name, domain, path), so expiring the name WITHOUT
// a Domain attribute removes only the host-only copy and leaves the real
// domain-wide session untouched. Fires only while a duplicate actually exists:
// one response later the browser is migrated and this is a no-op forever.
const DUPLICATE_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "__Secure-better-auth.session_data",
  "better-auth.session_token",
  "better-auth.session_data",
];

function hostOnlyCookieCleanup(request: NextRequest): string[] {
  const header = request.headers.get("cookie");
  if (!header) return [];
  const cleanup: string[] = [];
  for (const name of DUPLICATE_COOKIE_NAMES) {
    const re = new RegExp(`(?:^|;\\s*)${name.replace(/\./g, "\\.")}=`, "g");
    if ((header.match(re) ?? []).length >= 2) {
      cleanup.push(
        `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      );
    }
  }
  return cleanup;
}

// Optimistic edge auth gate: checks only for the presence of the session cookie
// (the real validation stays in (app)/layout via getServerSession). Ported from
// sidebar and adapted to watchparty's routes (/login, /home).
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = getSessionCookie(request);

  // Expire stale host-only duplicates on EVERY branch below — including the
  // API pass-through, because /api/auth/get-session is exactly the request
  // whose cookie read the duplicate corrupts.
  const cleanup = hostOnlyCookieCleanup(request);
  const withCleanup = (res: NextResponse) => {
    for (const c of cleanup) res.headers.append("Set-Cookie", c);
    return res;
  };

  // Always allow better-auth + internal API routes (tRPC, webhooks).
  if (pathname.startsWith(apiAuthPrefix) || pathname.startsWith("/api/")) {
    return withCleanup(NextResponse.next());
  }

  // /feed/post/<id> is /status/<id> now.
  //
  // Handled HERE, ahead of the auth gate, rather than left to next.config's
  // redirects(): on Workers this edge middleware runs first, so a logged-out
  // visitor to the old path was sent to /login carrying the DEAD path as its
  // callbackUrl. That matters more than it looks — a coin's on-chain metadata
  // points at the old path forever and can never be edited, so it has to
  // resolve identically whether the visitor is signed in, signed out, or a
  // crawler fetching an OG card.
  const legacyPost = /^\/feed\/post\/([^/]+)\/?$/.exec(pathname);
  if (legacyPost) {
    const moved = new URL(`/status/${legacyPost[1]}`, request.url);
    moved.search = request.nextUrl.search;
    return withCleanup(NextResponse.redirect(moved, 308));
  }

  // On an auth route (/login): always allow. We do NOT optimistically redirect
  // a "logged-in" user to the app here, because getSessionCookie only checks the
  // cookie's PRESENCE. If the cookie is present but the session is invalid, that
  // redirect loops: /home -> (app)/layout (no session) -> /login -> here -> /home
  // -> ... which Safari shows as "this page couldn't load". Post-login redirects
  // already send users to /home directly, so this is purely a safety removal.
  if (authRoutes.some((route) => pathname.startsWith(route))) {
    return withCleanup(NextResponse.next());
  }

  // Everything else that isn't explicitly public requires a session. Carry the
  // destination through login (invite links, deep links) — the login card
  // funnels every auth method through resolvePostLoginRedirect(callbackUrl),
  // which only honors same-site targets.
  const isPublic = publicRoutes.includes(pathname)
    || publicPrefixes.some((p) => pathname.startsWith(p))
    // lib/auth/public-browsing.ts — one flag opens the browse surfaces to
    // signed-out visitors and leaves the personal ones (messages, settings,
    // wallet) gated. Flip it off and this term is always false, restoring the
    // wall exactly.
    || allowsAnonymous(pathname);

  if (!session && !isPublic) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return withCleanup(NextResponse.redirect(login));
  }

  // The app layout re-checks the session for real (this is a cookie-presence
  // check only), and it needs to know WHICH path it's rendering to decide
  // whether anonymous is allowed. Next doesn't expose the pathname to a server
  // component, so it travels as a header.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return withCleanup(NextResponse.next({ request: { headers } }));
}

export const config = {
  // Skip static assets, icons, and the web manifest; run on everything else.
  // (Without excluding manifest.webmanifest the proxy redirects it to /login and
  // the browser sees HTML -> "manifest is not valid JSON data".)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
