import { describe, expect, test } from "bun:test";
import { quotaFor, FREE_QUOTA, TIER_QUOTAS } from "@/lib/premium/assistant-quota";
import { isEntitled } from "@/server/lib/premium-entitlement";
import type { TierKey } from "@/lib/premium/tiers";

// The two pure predicates behind the assistant's paywall. Both decide who gets
// charged for what, and both have semantics that look wrong until you know why
// — which is exactly what makes them worth pinning.

describe("isEntitled", () => {
    const future = () => new Date(Date.now() + 86_400_000);
    const past = () => new Date(Date.now() - 86_400_000);

    test("active with an unexpired period is entitled", () => {
        expect(isEntitled({ status: "active", currentPeriodEnd: future() })).toBe(true);
    });

    // The counter-intuitive one. past_due is the grace window while the
    // collector retries a failed pull (app/api/cron/premium-collect). Someone
    // "simplifying" this to status === "active" would silently cut off paying
    // subscribers on a transient charge failure.
    test("past_due is STILL entitled — it is the collector's retry window", () => {
        expect(isEntitled({ status: "past_due", currentPeriodEnd: future() })).toBe(true);
    });

    test("cancelled and expired are never entitled, even mid-period", () => {
        expect(isEntitled({ status: "cancelled", currentPeriodEnd: future() })).toBe(false);
        expect(isEntitled({ status: "expired", currentPeriodEnd: future() })).toBe(false);
    });

    // currentPeriodEnd is the real gate, not status. A subscription whose very
    // first charge failed is written with periodEnd = now, so the time
    // comparison is what actually rejects it.
    test("an expired period is not entitled whatever the status says", () => {
        expect(isEntitled({ status: "active", currentPeriodEnd: past() })).toBe(false);
        expect(isEntitled({ status: "past_due", currentPeriodEnd: past() })).toBe(false);
    });

    test("a missing period end is not entitled", () => {
        expect(isEntitled({ status: "active", currentPeriodEnd: null })).toBe(false);
    });

    test("null status is not entitled", () => {
        expect(isEntitled({ status: null, currentPeriodEnd: future() })).toBe(false);
    });
});

describe("quotaFor", () => {
    test("no entitlement falls back to the free quota, whatever tier is claimed", () => {
        expect(quotaFor(null, false)).toEqual(FREE_QUOTA);
        // The important half: a stale/forged tier must not grant a paid quota
        // when `entitled` is false. entitled is the gate; tierKey only selects.
        expect(quotaFor("biz_pro", false)).toEqual(FREE_QUOTA);
    });

    test("entitled tiers get their own quota", () => {
        expect(quotaFor("basic", true)).toEqual(TIER_QUOTAS.basic);
        expect(quotaFor("premium", true)).toEqual(TIER_QUOTAS.premium);
        expect(quotaFor("biz_pro", true)).toEqual(TIER_QUOTAS.biz_pro);
    });

    test("entitled but with no tier key falls back to free rather than throwing", () => {
        expect(quotaFor(null, true)).toEqual(FREE_QUOTA);
    });

    test("an unknown tier key falls back to free rather than undefined", () => {
        // TIER_QUOTAS[key] would be undefined for a tier added to tiers.ts and
        // forgotten here — the ?? FREE_QUOTA is what stops that becoming a
        // crash inside the rate limiter.
        expect(quotaFor("not_a_tier" as TierKey, true)).toEqual(FREE_QUOTA);
    });

    test("every tier in TIER_QUOTAS is bounded — no unmetered path", () => {
        // biz_custom is deliberately capped rather than unlimited: an unmetered
        // path is how a bug becomes an invoice.
        for (const [tier, quota] of Object.entries(TIER_QUOTAS)) {
            expect(Number.isFinite(quota.messages), `${tier} messages`).toBe(true);
            expect(Number.isFinite(quota.tokens), `${tier} tokens`).toBe(true);
            expect(quota.messages).toBeGreaterThan(0);
            expect(quota.tokens).toBeGreaterThan(0);
        }
    });

    test("paid tiers are strictly better than free", () => {
        for (const [tier, quota] of Object.entries(TIER_QUOTAS)) {
            expect(quota.messages, `${tier} messages`).toBeGreaterThan(FREE_QUOTA.messages);
            expect(quota.tokens, `${tier} tokens`).toBeGreaterThan(FREE_QUOTA.tokens);
        }
    });
});
