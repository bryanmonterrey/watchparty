// Route lists for the edge proxy (proxy.ts).

// Routes anyone can visit without a session.
export const publicRoutes: string[] = ["/"];

// Auth routes — a signed-in user hitting these is sent to the app instead.
export const authRoutes: string[] = ["/login"];

// better-auth's API namespace — always allowed through.
export const apiAuthPrefix: string = "/api/auth";

// Where a signed-in user lands (matches POST_LOGIN_REDIRECT).
export const DEFAULT_LOGIN_REDIRECT: string = "/home";
