// Route lists for the edge proxy (proxy.ts).

// Routes anyone can visit without a session. Includes the public marketing
// pages (the (marketing) route group); the signed-in redirect to /home happens
// in (marketing)/layout, not here.
export const publicRoutes: string[] = [
  "/",
  "/explore",
  "/live",
  "/creators",
  "/coins",
  "/community",
  "/safety",
  "/about",
  "/developer",
];

// Public PREFIXES (dynamic public pages, e.g. the embeddable server widget
// and the post-embed iframes). /developer/ covers the portal's docs; the
// console under it gates itself server-side (session check in its page).
export const publicPrefixes: string[] = ["/widget/", "/embed/", "/developer/"];

// Auth routes — a signed-in user hitting these is sent to the app instead.
export const authRoutes: string[] = ["/login"];

// better-auth's API namespace — always allowed through.
export const apiAuthPrefix: string = "/api/auth";

// Where a signed-in user lands (matches POST_LOGIN_REDIRECT).
export const DEFAULT_LOGIN_REDIRECT: string = "/home";
