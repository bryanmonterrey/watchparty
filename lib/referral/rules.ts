// Referral rules — the pure part of the referral program, kept free of DB and
// tRPC so `tests/referral-rules.test.ts` can pin every decision.
//
// The model (decided 2026-09-03, see docs in CLAUDE.md "Referral links"):
//   • A link is `/?ref=<slug|code>`. The SLUG is claimed once from the
//     username the first time the user sees their link and is never changed
//     by a rename — links in bios and old posts keep working, and the freed
//     username cannot be registered by someone else to hijack them.
//   • Resolution is slug → username → code, case-insensitive for the first
//     two. The username step exists so `?ref=<current handle>` works for
//     accounts that never claimed a slug; the code step is the legacy
//     6-character fallback and only runs when the input looks like one.
//   • A referral may only be applied inside APPLY_WINDOW_DAYS of joining, and
//     never to yourself, to the person who referred you, or to/from a bot.

export const APPLY_WINDOW_DAYS = 30;
export const REF_INPUT_MAX = 40;
export const REF_INPUT_MIN = 2;

/** Legacy alphanumeric codes: 6 chars, stored upper-case. */
export const CODE_RE = /^[A-Z0-9]{6}$/;

/**
 * Trim, drop a leading "@" (people paste handles), clamp to REF_INPUT_MAX.
 * Returns null when nothing usable is left.
 */
export function normalizeRefInput(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let s = raw.trim();
    if (s.startsWith("@")) s = s.slice(1);
    s = s.slice(0, REF_INPUT_MAX).trim();
    return s.length >= REF_INPUT_MIN ? s : null;
}

/** The part after `?ref=` for a user's own link: the claimed slug, else the code. */
export function linkSlugFor(u: { referralSlug: string | null; referralCode: string | null }): string | null {
    return u.referralSlug ?? u.referralCode ?? null;
}

export function isWithinApplyWindow(createdAt: Date | null | undefined, now: number = Date.now()): boolean {
    // No join date is a data gap, not a reason to lock someone out.
    if (!createdAt) return true;
    return now - createdAt.getTime() <= APPLY_WINDOW_DAYS * 86_400_000;
}

export interface ReferrerLookups<R> {
    bySlug(slugLower: string): Promise<R | null | undefined>;
    byUsername(usernameLower: string): Promise<R | null | undefined>;
    byCode(codeUpper: string): Promise<R | null | undefined>;
}

/**
 * Find who a ref input points at. Slug beats username beats code, so a
 * claimed slug always wins over whoever currently holds that handle, and a
 * username that happens to spell someone's code still resolves to the user.
 */
export async function resolveReferrer<R>(input: string, lookups: ReferrerLookups<R>): Promise<R | null> {
    const lower = input.toLowerCase();
    const viaSlug = await lookups.bySlug(lower);
    if (viaSlug) return viaSlug;
    const viaUsername = await lookups.byUsername(lower);
    if (viaUsername) return viaUsername;
    const upper = input.toUpperCase();
    if (!CODE_RE.test(upper)) return null;
    return (await lookups.byCode(upper)) ?? null;
}

export type ApplyRejection =
    | "already_referred"
    | "window_closed"
    | "self"
    | "mutual"
    | "bot";

export const APPLY_REJECTION_MESSAGE: Record<ApplyRejection, string> = {
    already_referred: "You've already applied a referral",
    window_closed: `Referrals can only be applied within ${APPLY_WINDOW_DAYS} days of joining`,
    self: "You can't refer yourself",
    mutual: "You can't refer someone who referred you",
    bot: "Bot accounts can't take part in referrals",
};

export interface ApplyingUser {
    id: string;
    referredBy: string | null;
    createdAt: Date | null;
    isBot: boolean;
}

export interface ReferrerUser {
    id: string;
    referredBy: string | null;
    isBot: boolean;
}

/** Rules about the applicant alone — checked before any lookup. */
export function applicantRejection(me: ApplyingUser, now: number = Date.now()): ApplyRejection | null {
    if (me.referredBy) return "already_referred";
    if (me.isBot) return "bot";
    if (!isWithinApplyWindow(me.createdAt, now)) return "window_closed";
    return null;
}

/** Rules about the pair — checked once the referrer is known. */
export function pairRejection(me: ApplyingUser, referrer: ReferrerUser): ApplyRejection | null {
    if (referrer.id === me.id) return "self";
    if (referrer.referredBy === me.id) return "mutual";
    if (referrer.isBot) return "bot";
    return null;
}

/**
 * Whether the settings page should offer "use @username for your link".
 * True when the account has a username that differs from its current slug
 * (or has no slug) and nobody else's link already uses that name.
 */
export function canClaimUsernameSlug(u: {
    username: string | null;
    referralSlug: string | null;
    usernameTakenByOtherSlug: boolean;
}): boolean {
    if (!u.username || u.usernameTakenByOtherSlug) return false;
    return !u.referralSlug || u.referralSlug.toLowerCase() !== u.username.toLowerCase();
}
