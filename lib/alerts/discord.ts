import { redis } from "@/lib/cache";

// Operational alerts to Discord.
//
// Built because the Helius quota ran out on 2026-08-04 and NOTHING said so: the
// assets fetch swallowed the 429, every wallet balance silently rendered as
// zero, and the only way to find it was to replay the request by hand. An
// upstream we depend on for money-shaped numbers has to be able to shout.
//
// Rules this follows, so it can be called from anywhere without thought:
//   • never throws — an alert failing must not take down the thing it reports on
//   • never blocks — callers `void` it
//   • deduped in Redis, because a quota outage means EVERY request fails and one
//     alert per request would be thousands of messages in a minute

// ⚠️ Reads BOTH names, and that is not defensive coding — it is the fix for
// this module having been dead in production since it was written.
//
// It only ever read `DISCORD_ALERT_WEBHOOK_URL`, which is set in NO env file
// and is NOT among the worker's 95 secrets (verified 2026-08-15 against the
// Cloudflare API). So `url` was always undefined, the guard below returned
// immediately, and every alert this system could have raised was silently
// dropped. The webhook that IS configured — a real Discord URL, live on the
// worker — is called `ALERT_WEBHOOK_URL`, which only
// app/api/webhooks/helius-treasury ever read.
//
// That is why nothing shouted for any of it: the Helius quota (2026-08-09), the
// Phoenix ranker being down six days, the Typesense cluster being deleted. Each
// was found by a human tripping over a symptom.
const WEBHOOK = () =>
    process.env.DISCORD_ALERT_WEBHOOK_URL ?? process.env.ALERT_WEBHOOK_URL;

export type AlertSeverity = "warn" | "error";

/** Discord embed sidebar colours. */
const COLOR: Record<AlertSeverity, number> = {
    warn: 0xffcc00,
    error: 0xff746c,
};

export async function sendDiscordAlert(opts: {
    /** Dedupe identity. One alert per key per window, e.g. "helius:quota". */
    key: string;
    title: string;
    detail?: string;
    severity?: AlertSeverity;
    /** Dedupe window. Default 30min — long enough not to spam, short enough to re-nag. */
    windowSeconds?: number;
}): Promise<void> {
    const url = WEBHOOK();
    if (!url) return; // not configured — silently no-op, this is optional infra

    const { key, title, detail, severity = "error", windowSeconds = 1800 } = opts;

    try {
        // NX: the first caller in the window wins and sends; everyone else is a
        // no-op. Same lock idiom lib/cache.ts uses for its SWR refresh.
        const claimed = await redis.set(`alert:${key}`, 1, { nx: true, ex: windowSeconds });
        if (claimed !== "OK") return;
    } catch {
        // Redis down: alert anyway. A duplicate message beats silence, and this
        // path only runs when something is already wrong.
    }

    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({
                embeds: [
                    {
                        title,
                        description: detail?.slice(0, 3800),
                        color: COLOR[severity],
                        timestamp: new Date().toISOString(),
                        footer: { text: "watchparty" },
                    },
                ],
            }),
        });
    } catch {
        // Nothing useful to do — the caller is already handling a failure.
    }
}

/**
 * Recognise a Helius quota/rate-limit refusal and alert on it.
 *
 * Helius answers an exhausted plan with HTTP 429 and the body "max usage
 * reached"; a burst limit is also 429. Both mean "no balances until someone
 * acts", which is worth waking up for.
 *
 * Returns true when the response was a quota refusal, so callers can fail loudly
 * instead of caching a zero.
 */
export function isHeliusQuotaError(status: number, body?: string): boolean {
    if (status === 429) return true;
    if (body && /max usage reached|credit limit|quota/i.test(body)) return true;
    return false;
}

export function alertHeliusQuota(context: string, status: number, body?: string): void {
    void sendDiscordAlert({
        key: "helius:quota",
        severity: "error",
        title: "Helius quota exhausted — wallet balances are down",
        detail: [
            `Helius refused a request with HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ""}.`,
            "",
            `Source: ${context}`,
            "",
            "Every wallet balance reads as ZERO while this lasts, because the assets",
            "fetch has no other source. Top up or upgrade the Helius plan and the",
            "next request recovers on its own.",
        ].join("\n"),
        // An hour: long enough to not spam through an outage, short enough that
        // a still-broken quota re-nags across a working day.
        windowSeconds: 3600,
    });
}

/**
 * The Swig treasury pays rent and fees for every embedded wallet's on-chain
 * account. When it runs dry, createSwigAccount fails and NOBODY can get an
 * embedded wallet created — which surfaced as "connect wallet" on the messages
 * page and took a day to trace, because the failure was silent everywhere.
 *
 * Deduped for an hour like the Helius alert: this fires from a per-user code
 * path, so an empty treasury means every affected user trips it.
 */
export function alertSwigTreasury(context: string, detail: string): void {
    void sendDiscordAlert({
        key: "swig:treasury",
        severity: "error",
        title: "Swig treasury can't fund wallet creation",
        detail: [
            detail,
            "",
            `Source: ${context}`,
            "",
            "Embedded wallets cannot be created on-chain while this lasts, which",
            "blocks messaging keys and wallet signing for the users affected.",
            "Top up the treasury keypair and it recovers on the next attempt.",
        ].join("\n"),
        windowSeconds: 3600,
    });
}
