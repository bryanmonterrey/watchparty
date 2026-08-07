import { redis } from "@/lib/cache";
import { quotaFor, type AssistantQuota } from "@/lib/premium/assistant-quota";
import type { PremiumEntitlement } from "./premium-entitlement";

// Usage accounting for "ask watchparty". Redis counters, keyed by the window
// they belong to so expiry does the resetting and nothing has to sweep.
//
// The window differs by who you are, which is the whole design:
//   - Paid: keyed on `currentPeriodEnd`, so the allowance renews exactly when
//     the bill does. Renewing writes a new periodEnd → a brand-new key → a
//     fresh allowance, with no cron and no reset job.
//   - Free: keyed on the UTC date. A daily reset makes the upgrade prompt a
//     recurring nudge rather than a one-time wall someone hits and forgets.
//
// FAILS OPEN. If Redis is unreachable the user is let through, matching
// app/api/create-wallet/route.ts and lib/security/audit-logger.ts. Note this
// only softens the QUOTA — entitlement is a Postgres read, so "is this person
// premium" is unaffected by Redis being down and still fails closed.

export type UsageSnapshot = {
    messages: number;
    tokens: number;
    quota: AssistantQuota;
    resetAt: Date;
    /** True when Redis was unreachable and the counts are not trustworthy. */
    degraded: boolean;
};

function windowFor(ent: PremiumEntitlement): { suffix: string; expiresAt: Date } {
    if (ent.entitled && ent.currentPeriodEnd) {
        return {
            suffix: `p${Math.floor(ent.currentPeriodEnd.getTime() / 1000)}`,
            expiresAt: ent.currentPeriodEnd,
        };
    }
    const now = new Date();
    const midnightUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    return { suffix: `d${now.toISOString().slice(0, 10)}`, expiresAt: midnightUtc };
}

const keys = (userId: string, suffix: string) => ({
    messages: `assistant:msgs:${userId}:${suffix}`,
    tokens: `assistant:toks:${userId}:${suffix}`,
});

/** Read-only — for the panel's "N left" display. Never mutates counters. */
export async function readAssistantUsage(
    userId: string,
    ent: PremiumEntitlement,
): Promise<UsageSnapshot> {
    const quota = quotaFor(ent.tierKey, ent.entitled);
    const { suffix, expiresAt } = windowFor(ent);
    const k = keys(userId, suffix);

    try {
        const [m, t] = await redis.mget<(number | null)[]>(k.messages, k.tokens);
        return {
            messages: Number(m ?? 0),
            tokens: Number(t ?? 0),
            quota,
            resetAt: expiresAt,
            degraded: false,
        };
    } catch {
        return { messages: 0, tokens: 0, quota, resetAt: expiresAt, degraded: true };
    }
}

export type SpendResult =
    | { allowed: true; remaining: number; resetAt: Date }
    | { allowed: false; reason: "messages" | "tokens"; quota: AssistantQuota; resetAt: Date };

/**
 * Charge one message against the quota. Call BEFORE streaming; pair with
 * `recordAssistantTokens` once the reply finishes.
 */
export async function spendAssistantMessage(
    userId: string,
    ent: PremiumEntitlement,
): Promise<SpendResult> {
    const quota = quotaFor(ent.tierKey, ent.entitled);
    const { suffix, expiresAt } = windowFor(ent);
    const k = keys(userId, suffix);
    const ttl = Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

    try {
        const [used, spentTokens] = await redis.mget<(number | null)[]>(k.messages, k.tokens);

        if (Number(used ?? 0) >= quota.messages) {
            return { allowed: false, reason: "messages", quota, resetAt: expiresAt };
        }
        // Checked, never pre-charged: token cost isn't known until the reply
        // exists, so this gate is "you were already over when you asked".
        if (Number(spentTokens ?? 0) >= quota.tokens) {
            return { allowed: false, reason: "tokens", quota, resetAt: expiresAt };
        }

        const next = await redis.incr(k.messages);
        // Only the first write sets expiry, so the window can't be pushed
        // forward by later traffic inside it.
        if (next === 1) await redis.expire(k.messages, ttl);

        return { allowed: true, remaining: Math.max(0, quota.messages - next), resetAt: expiresAt };
    } catch {
        return { allowed: true, remaining: quota.messages, resetAt: expiresAt };
    }
}

/**
 * Give back a message charged by `spendAssistantMessage` when the reply never
 * arrived — an upstream 5xx, a model error, anything that isn't the user's
 * fault. Charging for an answer we failed to deliver is the kind of thing
 * people notice and resent on a paid feature.
 *
 * NOT called on abort: a user who stops a reply mid-stream got what they asked
 * for and the tokens were really spent.
 */
export async function refundAssistantMessage(
    userId: string,
    ent: PremiumEntitlement,
): Promise<void> {
    const { suffix } = windowFor(ent);
    const k = keys(userId, suffix);
    try {
        // Floor at zero so a refund racing an expiry can't leave the counter
        // negative and hand out a free extra message next window.
        const left = await redis.decr(k.messages);
        if (left < 0) await redis.set(k.messages, 0);
    } catch {
        // Fails open like the rest of the accounting.
    }
}

/** Add the reply's real token cost. Best-effort — never fails the request. */
export async function recordAssistantTokens(
    userId: string,
    ent: PremiumEntitlement,
    tokens: number,
): Promise<void> {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    const { suffix, expiresAt } = windowFor(ent);
    const k = keys(userId, suffix);
    const ttl = Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

    try {
        const total = await redis.incrby(k.tokens, Math.round(tokens));
        if (total === Math.round(tokens)) await redis.expire(k.tokens, ttl);
    } catch {
        // Accounting is not worth failing a delivered answer over.
    }
}
