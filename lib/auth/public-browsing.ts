// Whether signed-out visitors can browse the app.
//
// ── THE TOGGLE ──────────────────────────────────────────────────────────────
// Flip PUBLIC_BROWSING to false and the login wall is back exactly as it was:
// every (app) route bounces to /login with a callbackUrl, and /login is once
// again where an unauthenticated visitor lands. Nothing else needs changing.
// ────────────────────────────────────────────────────────────────────────────
//
// With it ON, /home is the landing surface: a visitor can watch, browse coins,
// read a post and look at a profile without an account, and only meets /login
// when they press Sign In or reach for something that is theirs.
//
// It is NOT a blanket opening. Personal surfaces stay gated below — a signed-out
// visitor has no messages, no settings and no wallet, so those routes are
// nonsense without a session rather than merely empty.

export const PUBLIC_BROWSING = true;

/**
 * Routes that require a session even when PUBLIC_BROWSING is on.
 *
 * Matched as whole segments — "/settings" and "/settings/anything", never
 * "/settingsomething".
 */
export const ALWAYS_PRIVATE_PREFIXES: string[] = [
    "/messages",
    "/settings",
    "/premium",
    "/notifications",
    "/quests",
    "/popout",
];

/** True when a path needs a session regardless of the toggle. */
export function isAlwaysPrivate(pathname: string): boolean {
    return ALWAYS_PRIVATE_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
}

/**
 * Whether an unauthenticated visitor may see this path.
 *
 * The single question both the edge middleware and the app layout ask, so the
 * optimistic cookie check and the real server-session check can't drift into
 * disagreeing about what's open.
 */
export function allowsAnonymous(pathname: string): boolean {
    return PUBLIC_BROWSING && !isAlwaysPrivate(pathname);
}
