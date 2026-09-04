// Circuit breaker for the Helius trades webhook.
//
// Registration (`trades-webhook.ts`) picks display coins by `txns_24h / 1440`,
// a DAILY MEAN. A coin that is being botted does not look like that: on
// 2026-09-04 TROLL's estimate was ~10 deliveries/min and it was firing ~1,400.
// That single address pushed the container past its 4,096-connection ceiling
// and every page on the site 500'd — "Error proxying request to container".
// The hourly sync would then have re-registered it, because nothing it can
// see had changed.
//
// So the receiver, the only place that measures the REAL rate, gets to shed:
// count deliveries per minute per watched address, and when the total blows
// past the budget, take the loudest address off the webhook and deny it for
// a day. The sync honours the denylist, so the next run can't undo the shed.
//
// The decision itself (`pickBurstOffender`) is pure so `tests/` can pin it.
import { redis } from "@/lib/cache";
import { heliusApiKey } from "@/lib/wallet/assets-webhook";

const DENY_PREFIX = "helius-trades:deny:";
const RATE_PREFIX = "helius-trades:rate:";
const LOCK_KEY = "helius-trades:breaker-lock";

/** How long a shed address stays out. Long enough for a bot run to end. */
export const DENY_SECONDS = 24 * 60 * 60;

/**
 * Deliveries per minute (all addresses together) that trip the breaker.
 * 10x the registration budget: a real burst on a legitimately hot coin
 * overshoots the estimate by 2–3x (measured in pool-budget.ts), so this only
 * fires on something that is nothing like the estimate.
 */
export const BREAKER_PER_MIN = Math.max(
    0,
    Number(process.env.HELIUS_TRADES_BREAKER_PER_MIN ?? 160) || 0,
);

/** `HELIUS_TRADES_EXCLUDE="addr1,addr2"` — a static denylist, no expiry. */
export function staticExclusions(): Set<string> {
    return new Set(
        (process.env.HELIUS_TRADES_EXCLUDE ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    );
}

/**
 * Which address to shed, given this minute's per-address counts.
 *
 * Only an address we actually watch can be shed (a swap touches ~20 accounts;
 * the counters are keyed on the watched ones only). Returns null when the
 * total is under the threshold, when nothing watched carries the load, or
 * when the loudest address is under half the threshold on its own — in that
 * case the load is spread and shedding one address wouldn't fix it.
 */
export function pickBurstOffender(
    counts: ReadonlyMap<string, number>,
    watched: ReadonlySet<string>,
    threshold: number,
): string | null {
    if (!(threshold > 0)) return null;
    let total = 0;
    let top: string | null = null;
    let topCount = 0;
    for (const [address, n] of counts) {
        if (!watched.has(address) || !(n > 0)) continue;
        total += n;
        if (n > topCount) {
            top = address;
            topCount = n;
        }
    }
    if (total < threshold) return null;
    if (topCount * 2 < threshold) return null;
    return top;
}

function minuteBucket(now = Date.now()): string {
    return String(Math.floor(now / 60_000));
}

/**
 * Count one delivery against every watched address it touched. Returns the
 * minute's running total so the caller can decide whether to look closer.
 */
export async function countDelivery(hits: readonly string[], now = Date.now()): Promise<number> {
    const bucket = minuteBucket(now);
    const p = redis.pipeline();
    p.incr(`${RATE_PREFIX}${bucket}`);
    p.expire(`${RATE_PREFIX}${bucket}`, 180);
    for (const a of hits) {
        p.incr(`${RATE_PREFIX}${bucket}:${a}`);
        p.expire(`${RATE_PREFIX}${bucket}:${a}`, 180);
    }
    const out = await p.exec<number[]>();
    return Number(out?.[0] ?? 0);
}

async function countsThisMinute(watched: readonly string[], now = Date.now()): Promise<Map<string, number>> {
    const bucket = minuteBucket(now);
    if (!watched.length) return new Map();
    const values = await redis.mget<(number | string | null)[]>(
        ...watched.map((a) => `${RATE_PREFIX}${bucket}:${a}`),
    );
    const m = new Map<string, number>();
    watched.forEach((a, i) => m.set(a, Number(values[i] ?? 0)));
    return m;
}

export async function denyAddress(address: string): Promise<void> {
    await redis.set(`${DENY_PREFIX}${address}`, Date.now(), { ex: DENY_SECONDS });
}

/** The subset of `addresses` currently denied (redis) or statically excluded. */
export async function deniedAmong(addresses: readonly string[]): Promise<Set<string>> {
    const out = staticExclusions();
    const unique = [...new Set(addresses)].filter(Boolean);
    if (!unique.length) return out;
    try {
        const values = await redis.mget<(number | string | null)[]>(...unique.map((a) => `${DENY_PREFIX}${a}`));
        unique.forEach((a, i) => {
            if (values[i] != null) out.add(a);
        });
    } catch (err) {
        // Redis down: the static list still applies; a stale dynamic deny is
        // the cheaper failure (one more hour of a quiet coin) than a crash.
        console.error("[trades-breaker] deny lookup failed:", err instanceof Error ? err.message : err);
    }
    return out;
}

/**
 * Take `address` off the live trades webhook. Helius rejects an empty list,
 * so if it was the only address the quietest thing to do is leave it — the
 * denylist still stops the sync re-adding it and the caller has logged.
 */
async function removeFromWebhook(address: string, webhookURL: string): Promise<boolean> {
    const apiKey = heliusApiKey();
    const list = await (await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`)).json();
    const stub = Array.isArray(list)
        ? list.find((w: { webhookURL?: string }) => w.webhookURL === webhookURL)
        : null;
    if (!stub?.webhookID) return false;
    const hook = await (
        await fetch(`https://api.helius.xyz/v0/webhooks/${stub.webhookID}?api-key=${apiKey}`)
    ).json();
    const current: string[] = Array.isArray(hook.accountAddresses) ? hook.accountAddresses : [];
    const next = current.filter((a) => a !== address);
    if (next.length === current.length || next.length === 0) return false;
    const res = await fetch(`https://api.helius.xyz/v0/webhooks/${stub.webhookID}?api-key=${apiKey}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            webhookURL,
            transactionTypes: hook.transactionTypes ?? stub.transactionTypes,
            accountAddresses: next,
            webhookType: hook.webhookType ?? stub.webhookType ?? "enhanced",
            ...(hook.authHeader ? { authHeader: hook.authHeader } : {}),
        }),
    });
    return res.ok;
}

/**
 * Run after `countDelivery` reports a total over the threshold. At most one
 * shed per two minutes (the lock), so a burst can't turn into a PUT storm —
 * each PUT is 100 credits.
 */
export async function shedIfBursting(
    watched: readonly string[],
    webhookURL: string,
    now = Date.now(),
): Promise<string | null> {
    const locked = await redis.set(LOCK_KEY, now, { nx: true, ex: 120 });
    if (locked !== "OK") return null;
    const counts = await countsThisMinute(watched, now);
    const offender = pickBurstOffender(counts, new Set(watched), BREAKER_PER_MIN);
    if (!offender) return null;
    await denyAddress(offender);
    let removed = false;
    try {
        removed = await removeFromWebhook(offender, webhookURL);
    } catch (err) {
        console.error("[trades-breaker] webhook edit failed:", err instanceof Error ? err.message : err);
    }
    console.error(
        `[trades-breaker] SHED ${offender}: ${counts.get(offender)} deliveries this minute ` +
        `(threshold ${BREAKER_PER_MIN}); denied ${DENY_SECONDS / 3600}h; webhook ${removed ? "updated" : "NOT updated"}`,
    );
    return offender;
}
