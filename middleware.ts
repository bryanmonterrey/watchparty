import { NextResponse, type NextRequest } from "next/server";
import { isKnownSlugMiss } from "@/lib/security/slug-miss-cache";
import { isJunkPath, isWriteToProfilePath } from "@/lib/security/junk-paths";

/** A real 404, with a body small enough that probing costs the prober more than us. */
function notFound() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  }) as NextResponse;
}

/** Top-level paths that are real routes, never usernames. */
const RESERVED_SLUGS = new Set([
  "login", "signup", "home", "feed", "search", "settings", "messages",
  "premium", "quests", "trade", "shorts", "video", "communities", "coin",
  "category", "status", "notifications", "wallet", "explore", "about",
  "developer", "studio",
]);
import { getSessionCookie } from "better-auth/cookies";
import { apiAuthPrefix, authRoutes, publicRoutes, publicPrefixes } from "./routes";
import { allowsAnonymous } from "./lib/auth/public-browsing";
import { apiGate } from "./lib/api-gate";
import { limitOrPass, oauthTokenLimiter, oauthInteractiveLimiter } from "./lib/rate-limit";

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
// async now: the slug-miss lookup below is a network call. Next supports an
// async middleware; every existing branch still returns synchronously.
export async function middleware(request: NextRequest) {
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

  // console.watchparty.xyz is its OWN worker now (console-app, the console/
  // sibling app — cut over 2026-08-10). This worker sees only that host's
  // /api/* traffic, which arrives via the zone route so keys, tRPC, and the
  // shared session cookie work same-origin for the console; those paths pass
  // through untouched below. developer.watchparty.xyz still 308s to console
  // here because the old host remains attached to THIS worker.
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (host === "developer.watchparty.xyz") {
    return withCleanup(
      NextResponse.redirect(new URL(pathname + request.nextUrl.search, "https://console.watchparty.xyz"), 308),
    );
  }
  // docs.watchparty.xyz IS the docs tree: every non-/api path rewrites under
  // /developer/docs, so future doc sub-pages get subdomain URLs for free.
  // /api passes through untouched — curl examples in the docs must behave
  // identically on every host.
  if (host === "docs.watchparty.xyz" && !pathname.startsWith("/api")) {
    return withCleanup(
      NextResponse.rewrite(new URL(`/developer/docs${pathname === "/" ? "" : pathname}`, request.url)),
    );
  }
  // studio.watchparty.xyz IS the creator studio: every non-/api path rewrites
  // under /studio (the (studio) route group self-gates on the session cookie).
  // /api passes through so the studio's tRPC calls reach the app's own handler.
  if (host === "studio.watchparty.xyz" && !pathname.startsWith("/api")) {
    return withCleanup(
      NextResponse.rewrite(new URL(`/studio${pathname === "/" ? "" : pathname}`, request.url)),
    );
  }
  // Always allow better-auth + internal API routes (tRPC, webhooks) for the
  // app's own traffic — external (session-less, off-site) callers go through
  // the 402 gate first (lib/api-gate.ts). API_402_MODE=off|log|enforce,
  // default off, so this is inert until deliberately flipped; see
  // docs/api-monetization.md before enforcing.
  if (pathname.startsWith(apiAuthPrefix) || pathname.startsWith("/api/")) {
    // OAuth2 IdP surface (better-auth oidc-provider). Two edge rules that the
    // plugin cannot express itself:
    if (pathname.startsWith("/api/auth/oauth2/")) {
      // 1. Dynamic client registration is off in the plugin options, but the
      //    /register endpoint STILL accepts any session holder (verified
      //    1.6.26 dist) — bypassing the developerApps router's ownership
      //    model, cap and redirect-URI policy. No plugin option disables the
      //    endpoint, so it is 404'd here outright.
      if (pathname === "/api/auth/oauth2/register") return withCleanup(notFound());
      // 2. Rate-limit token/authorize/consent by IP. better-auth's own
      //    rateLimit block only runs in production; this is the primary gate.
      if (
        pathname === "/api/auth/oauth2/token" ||
        pathname === "/api/auth/oauth2/authorize" ||
        pathname === "/api/auth/oauth2/consent"
      ) {
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const limiter =
          pathname === "/api/auth/oauth2/token" ? oauthTokenLimiter : oauthInteractiveLimiter;
        if (!(await limitOrPass(limiter, `${pathname}:${ip}`))) {
          return withCleanup(
            new NextResponse("Too Many Requests", {
              status: 429,
              headers: { "retry-after": "60", "content-type": "text/plain; charset=utf-8" },
            }),
          );
        }
      }
    }
    const gate = await apiGate(request, !!session);
    if (gate?.block) return withCleanup(gate.block);
    const res = NextResponse.next();
    if (gate?.headers) for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
    if (gate?.settleHeader) res.headers.set("X-PAYMENT-RESPONSE", gate.settleHeader);
    return withCleanup(res);
  }

  // Paths that are provably not routes, 404'd outright with no lookup.
  //
  // The single-segment guard below needed a negative cache because a slug
  // *might* be a real username. Nothing here might be anything: there is no
  // route under `/wp-admin/`, no `.php` anywhere in this app, and `/.env` and
  // `/.git/config` are asking for files that must never be served. Measured on
  // production 2026-08-09, every one of them returned **200 with ~93 KB** —
  // a full SSR soft-404, uncacheable, ~2s of origin time each:
  //
  //     /wp-admin/setup-config.php   200   92,928 bytes   1.87s
  //     /.git/config                 200   92,870 bytes   1.97s
  //     /.env                        200   94,547 bytes   2.40s
  //
  // A 200 is what tells a scanner it found something. That is the exact
  // mechanism behind the 2026-08-09 saturation, which was only ever closed for
  // single-segment paths — every other shape was still wide open.
  if (isJunkPath(pathname)) return withCleanup(notFound());

  // A single-segment path is a USERNAME (app/(app)/[username]), so an unknown
  // one still renders the whole app and answers 200 — Next cannot set a 404
  // once streaming has begun (see docs/buzz-adoption-plan.md). Middleware runs
  // BEFORE the response streams, so it still can.
  //
  // Only slugs already PROVEN missing by the page itself are 404'd here, and
  // the lookup fails open, so this can never 404 a real profile.
  const singleSegment = /^\/[^/]+$/.test(pathname) ? pathname.slice(1) : null;
  if (singleSegment && !RESERVED_SLUGS.has(singleSegment.toLowerCase())) {
    // A WRITE to a profile URL is always a probe — and it is the shape the
    // negative cache structurally cannot catch, because the cache only learns
    // when the page renders and this traffic never renders it. That is why
    // `/pipeline` kept answering 200: it is POST, from an empty user agent.
    // Checked before the cache lookup so it costs nothing at all.
    if (isWriteToProfilePath(pathname, request.method)) return withCleanup(notFound());

    if (await isKnownSlugMiss(singleSegment)) return withCleanup(notFound());
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
