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

export interface HeliusWebhookState {
    accountAddresses?: unknown;
    transactionTypes?: unknown;
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
        const types = Array.isArray(current.transactionTypes) ? (current.transactionTypes as string[]) : [];
        return (
            sameAddressSet(current.accountAddresses, nextAddresses) &&
            types.join(",") === nextTransactionTypes.join(",")
        );
    } catch {
        return false;
    }
}
