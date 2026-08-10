import { after } from "next/server";
import { and, arrayContains, count, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { developerWebhookDeliveries, developerWebhooks } from "@/db/schema/content/developer-webhook";
import { hmacHex, randHex } from "@/lib/api-gate";
import { openSecret } from "@/lib/developer/secret-box";
import { WEBHOOK_TEST_EVENT, type WebhookEventType } from "@/lib/developer/webhook-events";

// Outbound developer-webhook dispatch. Design constraints, in order:
//
// 1. A dispatch call must NEVER break its host flow — everything is wrapped;
//    failures are logged and swallowed.
// 2. Hot paths pay one indexed PK lookup and nothing else: `data` is a THUNK,
//    built only after we know the user actually has a subscribed endpoint.
// 3. Delivery runs off the request via next/server `after()` (OpenNext maps
//    it to waitUntil on Workers). `after()` throws outside request scope
//    (cron/background contexts) — the catch falls back to awaiting inline.
// 4. Semantics are at-least-once, no retries (v1). Consumers dedupe on the
//    payload `id`, or on domain keys (e.g. stream sessionId) for chokepoints
//    that can re-fire.

const DELIVERY_TIMEOUT_MS = 5_000;
const PRUNE_BEFORE_DAYS = 30;
// Egress cap: an account's endpoint hears at most this many deliveries per
// minute. Own-account events sit far below it; what it actually bounds is a
// user manufacturing events in a loop to make us hammer a URL they chose.
// Counted from the deliveries log (already indexed on user_id+created_at) so
// background dispatch never depends on Redis; fail-open on count errors.
const DELIVERY_CAP_PER_MIN = 60;

export type DeliveryResult = { ok: boolean; status: number | null; durationMs: number };

async function deliver(
    row: { userId: string; url: string; secret: string },
    type: string,
    data: unknown,
): Promise<DeliveryResult> {
    try {
        const [{ n }] = await db
            .select({ n: count() })
            .from(developerWebhookDeliveries)
            .where(and(
                eq(developerWebhookDeliveries.userId, row.userId),
                gte(developerWebhookDeliveries.createdAt, new Date(Date.now() - 60_000)),
            ));
        if (n >= DELIVERY_CAP_PER_MIN) {
            // Skipped deliveries are not logged — a logged row would extend
            // the window and wedge the endpoint at the cap forever.
            console.warn(`webhook delivery cap hit for ${row.userId}, dropping ${type}`);
            return { ok: false, status: null, durationMs: 0 };
        }
    } catch {
        // Fail open: a broken count query must not stop deliveries.
    }

    const body = JSON.stringify({
        id: `evt_${randHex(8)}`,
        type,
        createdAt: new Date().toISOString(),
        data,
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(await openSecret(row.secret), `${t}.${body}`);

    const started = Date.now();
    let status: number | null = null;
    try {
        const res = await fetch(row.url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "user-agent": "watchparty-webhooks/1.0",
                "x-watchparty-event": type,
                "x-watchparty-signature": `t=${t},v1=${sig}`,
            },
            body,
            // Never follow redirects: the URL blocklist only vets the saved
            // endpoint, so a 3xx could bounce this signed POST to a blocked
            // host (our own API, loopback). A webhook receiver has no reason
            // to redirect — treat any 3xx as a failed delivery.
            redirect: "manual",
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        status = res.status;
        // Receivers only need the status; never read the body.
        await res.body?.cancel().catch(() => {});
    } catch {
        status = null; // network error / timeout / bad URL at runtime
    }
    const durationMs = Date.now() - started;
    const ok = status !== null && status >= 200 && status < 300;

    try {
        await db.insert(developerWebhookDeliveries).values({
            id: `del_${randHex(8)}`,
            userId: row.userId,
            event: type,
            status,
            ok,
            durationMs,
        });
        await db.delete(developerWebhookDeliveries).where(and(
            eq(developerWebhookDeliveries.userId, row.userId),
            lt(developerWebhookDeliveries.createdAt, new Date(Date.now() - PRUNE_BEFORE_DAYS * 86_400_000)),
        ));
    } catch (err) {
        console.error("webhook delivery log failed:", err);
    }

    return { ok, status, durationMs };
}

async function configsFor(userIds: string[], type: string) {
    if (!userIds.length) return [];
    return db
        .select({
            userId: developerWebhooks.userId,
            url: developerWebhooks.url,
            secret: developerWebhooks.secret,
        })
        .from(developerWebhooks)
        .where(and(
            inArray(developerWebhooks.userId, userIds),
            eq(developerWebhooks.enabled, true),
            arrayContains(developerWebhooks.events, [type]),
        ));
}

/**
 * Fire `type` at the webhook endpoints of `userIds` (deduped). The payload
 * thunk runs once, only if at least one recipient is subscribed.
 */
export async function dispatchDeveloperEvent(
    userIds: string | string[],
    type: WebhookEventType,
    data: (() => unknown | Promise<unknown>) | Record<string, unknown>,
): Promise<void> {
    try {
        const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
        const rows = await configsFor(ids, type);
        if (!rows.length) return;

        const payload = typeof data === "function" ? await data() : data;
        const run = async () => {
            for (const row of rows) await deliver(row, type, payload);
        };
        try {
            after(run);
        } catch {
            // No request scope (cron / background task) — deliver inline.
            await run();
        }
    } catch (err) {
        console.error(`webhook dispatch (${type}) failed:`, err);
    }
}

/**
 * The console's "Send test" (and the §7 payload-preview flow): delivers
 * synchronously regardless of event subscriptions, returns the result.
 * Requires an enabled endpoint.
 */
export async function sendTestDelivery(userId: string): Promise<DeliveryResult | null> {
    const [row] = await db
        .select({
            userId: developerWebhooks.userId,
            url: developerWebhooks.url,
            secret: developerWebhooks.secret,
        })
        .from(developerWebhooks)
        .where(and(eq(developerWebhooks.userId, userId), eq(developerWebhooks.enabled, true)))
        .limit(1);
    if (!row) return null;
    return deliver(row, WEBHOOK_TEST_EVENT, {
        message: "If you can read this, your endpoint and signature verification work.",
    });
}
