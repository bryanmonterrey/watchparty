// Cloudflare Cron Triggers worker for the premium/treasury automation.
//
// The actual logic lives in the Next/OpenNext app's guarded routes
// (/api/cron/premium-collect renews due subscriptions; /api/cron/treasury-sweep
// moves profit to the cold wallet). This worker just calls them on schedule with
// the shared CRON_SECRET. Kept separate from the OpenNext worker because that
// worker has no scheduled() handler.
//
// Schedules (wrangler.jsonc): collect "0 * * * *" (hourly), sweep "*/30 * * * *",
// feed-corpus "17 * * * *" (hourly, Phoenix ranker corpus refresh),
// sync-assets-webhook "30 4 * * *" (daily, re-sync Helius watched wallets).

interface Env {
    CRON_SECRET: string;
    TARGET_BASE_URL: string;
}

async function call(env: Env, path: string): Promise<void> {
    const res = await fetch(`${env.TARGET_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const body = await res.text();
    console.log(`${path} -> ${res.status} ${body.slice(0, 300)}`);
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
}

export default {
    async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        // At :00 both crons fire as separate events — dispatch by which one triggered.
        if (event.cron === "*/30 * * * *") {
            ctx.waitUntil(call(env, "/api/cron/treasury-sweep"));
        } else if (event.cron === "17 * * * *") {
            // Phoenix feed ranker: refresh the candidate corpus (embed recent
            // posts + live streams into post_embeddings).
            ctx.waitUntil(call(env, "/api/cron/feed-corpus"));
        } else if (event.cron === "30 4 * * *") {
            // Re-sync the Helius wallet-assets webhook with newly linked wallets.
            ctx.waitUntil(call(env, "/api/cron/sync-assets-webhook"));
        } else if (event.cron === "*/10 * * * *") {
            // Callout leaderboard: advance peak gains + pay multiplier XP bonuses.
            ctx.waitUntil(call(env, "/api/cron/callout-performance"));
        } else {
            ctx.waitUntil(call(env, "/api/cron/premium-collect"));
        }
    },
} satisfies ExportedHandler<Env>;
