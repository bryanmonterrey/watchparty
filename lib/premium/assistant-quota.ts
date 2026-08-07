import type { TierKey } from "./tiers";

// Usage limits for "ask watchparty" (components/ai/, app/api/assistant/route.ts).
//
// Shared client+server on purpose: the panel renders the remaining count, and
// a number the UI invents separately from the one the server enforces is a
// number that will eventually disagree with it.
//
// TWO limits, and the reason is cost. Workers AI bills per token, so a message
// count is only a proxy — a 4,000-character prompt with 20 turns of history
// costs ~50x a one-liner while counting as the same single "message". So:
//
//   - `messages` is the limit users see and understand. It's the product.
//   - `tokens` is a silent backstop sized well above what normal use reaches.
//     It exists so one person can't burn the month's budget with max-length
//     prompts, and should never fire for a real conversation. If it starts
//     firing for ordinary users, it's mis-sized — raise it, don't tighten it.
//
// Whichever trips first blocks.

export type AssistantQuota = {
    messages: number;
    tokens: number;
};

// Signed in, no active subscription. A taste, not a tier — enough to find out
// whether the thing is useful, which is the only way a free user ever decides
// to pay for it. Resets daily rather than monthly so the upgrade prompt is a
// recurring nudge instead of a one-time wall.
export const FREE_QUOTA: AssistantQuota = { messages: 5, tokens: 25_000 };

// Paid tiers, per BILLING PERIOD (renews with the bill, not the calendar).
export const TIER_QUOTAS: Record<TierKey, AssistantQuota> = {
    basic: { messages: 200, tokens: 500_000 },
    premium: { messages: 1_000, tokens: 2_500_000 },
    biz_basic: { messages: 3_000, tokens: 7_500_000 },
    biz_pro: { messages: 10_000, tokens: 25_000_000 },
    // Contact-sales tier — same ceiling as biz_pro until a contract says
    // otherwise. Deliberately not Infinity: an unmetered path is how a bug
    // becomes an invoice.
    biz_custom: { messages: 10_000, tokens: 25_000_000 },
};

export function quotaFor(tierKey: TierKey | null, entitled: boolean): AssistantQuota {
    if (!entitled || !tierKey) return FREE_QUOTA;
    return TIER_QUOTAS[tierKey] ?? FREE_QUOTA;
}
