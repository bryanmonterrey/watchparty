/**
 * Don't pay 100 credits to re-register a webhook that hasn't changed.
 *
 * Helius bills **1 credit per delivery** but **100 credits per webhook edit**
 * (https://www.helius.dev/docs/webhooks). Three syncs run from
 * `/api/cron/sync-assets-webhook` on the hourly trigger, and all three used to
 * PUT unconditionally:
 *
 *     25 runs/day x 3 webhooks x 100 credits = 7,500/day
 *                                            = 232,500/month = 23% of the free plan
 *
 * — spent re-sending payloads byte-for-byte identical to what was already
 * registered. That is a quarter of the quota for no change at all, on an app
 * with no users.
 *
 * Reads are not billed, so checking first is free. The watch sets move only
 * when the trending board or the set of linked wallets moves, which is a few
 * times a day at most; the rest of the runs now cost nothing.
 */

import { heliusWebhookSecret } from "./webhook-secret";

export interface HeliusWebhookState {
    authHeader?: unknown;
    accountAddresses?: unknown;
    transactionTypes?: unknown;
    /**
     * Helius auto-disables a webhook whose endpoint fails too often (≥95% over
     * 24h on the free plan). Confirmed present on the live GET response.
     */
    active?: unknown;
}

/**
 * Same watch set? Order-insensitive on purpose.
 *
 * `selectPoolsWithinBudget` sorts cheapest-first, so a pool whose `txns24h`
 * merely ticked up can reorder the array without changing WHAT is watched.
 * A positional comparison would call that a change and spend 100 credits
 * re-registering an identical set — which is the bug this file exists to stop,
 * reintroduced by a subtler route.
 */
export function sameAddressSet(current: unknown, next: readonly string[]): boolean {
    if (!Array.isArray(current) || current.length !== next.length) return false;
    const have = new Set(current as string[]);
    return next.every((a) => have.has(a));
}

/**
 * Fetch a webhook by id and decide whether a PUT would be a no-op.
 *
 * ⚠️ Fetches BY ID, never from the list endpoint. The list response omits
 * `accountAddresses`, so every webhook comes back looking like it watches
 * zero — which has already misled this codebase twice: once when the shrink
 * script believed a flood was stopped, and again on 2026-08-11 when a status
 * check read "0 addresses" on three healthy webhooks.
 *
 * Returns `false` on any error: failing to compare must mean "write it", never
 * "skip it". A missed edit leaves a stale registration live, which is the
 * expensive direction.
 *
 * ⚠️ A DISABLED webhook is never "current", however well its address list
 * matches. Helius auto-disables an endpoint that fails too often (≥95% over 24h
 * on the free plan), and a disabled webhook delivers nothing while still
 * reporting the addresses and types it was configured with. Comparing only
 * those two fields would therefore see "no change", skip the write, and leave
 * the webhook dead — permanently, because every subsequent hourly run reaches
 * the same conclusion. The unconditional PUT this guard replaced happened to
 * revive it; the guard has to do that deliberately.
 */
export async function webhookIsCurrent(
    apiKey: string,
    webhookID: string,
    nextAddresses: readonly string[],
    nextTransactionTypes: readonly string[],
): Promise<boolean> {
    try {
        const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookID}?api-key=${apiKey}`);
        if (!res.ok) return false;
        const current = (await res.json()) as HeliusWebhookState;
        // Explicitly false only — the field is absent on some responses, and
        // "absent" must not read as "disabled" or the guard never skips.
        if (current.active === false) return false;
        const types = Array.isArray(current.transactionTypes) ? (current.transactionTypes as string[]) : [];
        // The auth header is part of "current" too: after a secret rotation
        // (lib/helius/webhook-secret.ts) the addresses have not changed, but a
        // webhook still sending the OLD header is a webhook whose every
        // delivery is now a 401. Skipping the write here would leave it that
        // way forever, since each later run reaches the same verdict.
        const secret = heliusWebhookSecret();
        if (secret && current.authHeader !== secret) return false;
        return (
            sameAddressSet(current.accountAddresses, nextAddresses) &&
            types.join(",") === nextTransactionTypes.join(",")
        );
    } catch {
        return false;
    }
}
