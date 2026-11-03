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
// sync-assets-webhook "17 * * * *" (hourly) AND "30 4 * * *" (daily) — re-syncs
//   the Helius watched wallets and, critically, re-applies the trades-webhook
//   pool cap; hourly because that cap only lands when the Helius call succeeds,
//   see the note at the call site,
// predictions-factory "7 * * * *" (hourly, AI market generation + auto-resolve),
// coin-alerts "* * * * *" (per-minute, the /home alert rail's ingestion pass),
// trending-sync "* * * * *" (per-minute slice of the /trending board's chains).

import { runMonitor, type MonitorEnv } from "./monitor";

interface Env extends MonitorEnv {
    CRON_SECRET: string;
    TARGET_BASE_URL: string;
    /** Service binding to the watchparty-jobs Worker. A Worker may not fetch()
     *  another Worker's workers.dev URL on the same account (error 1042), so the
     *  crons reach it through the binding; TARGET_BASE_URL only supplies the URL. */
    JOBS?: Fetcher;
}

// Every cron call hits the app over its PUBLIC url, so each one is an inbound
// connection to the container. Unbounded, that is a leak with a clock on it:
// this fires every minute, and any endpoint that hangs (all of them did while
// the Helius key was exhausted and /api/rpc 502'd) leaves its connection open
// forever. One per minute, per endpoint, with zero users — which is how
// production hit Cloudflare's 4096 concurrent-connection ceiling on
// 2026-08-08 and started 500-ing every route at the proxy.
//
// 120s is generous for these jobs and still bounded. A cron that genuinely
// needs longer should return early and continue its own work, not hold the
// request open.
const CALL_TIMEOUT_MS = 120_000;

async function call(env: Env, path: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
        const res = await (env.JOBS ? env.JOBS.fetch.bind(env.JOBS) : fetch)(`${env.TARGET_BASE_URL}${path}`, {
            headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
            signal: controller.signal,
        });
        const body = await res.text();
        console.log(`${path} -> ${res.status} ${body.slice(0, 300)}`);
        if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    } finally {
        clearTimeout(timer);
        // Unconditional — releases the connection on the throw path too.
        controller.abort();
    }
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
            // 402 gate: fold Redis spend counters into the api_keys ledger and
            // repair lost balances/revocations (lib/api-gate.ts).
            ctx.waitUntil(call(env, "/api/cron/api-credits-flush"));
            // HOURLY as well as daily, and the reason is recovery time.
            //
            // The Helius plan was exhausted on 2026-08-09 (webhooks = 99.8% of
            // 1M credits in ~1.5 days), and the cap that prevents a repeat lives
            // in `syncTradesWebhook()` — which only applies when the call
            // SUCCEEDS. That call is on the same exhausted key, so while the
            // plan is out the wide registration simply stays live.
            //
            // On the daily schedule alone, the moment quota returns the old
            // config resumes at ~2,055 deliveries/min for up to 24 hours before
            // the next sync — which at 541k credits/day re-exhausts a fresh
            // plan almost immediately. Hourly bounds that window to ~1 hour.
            // Idempotent and cheap; a failed call costs nothing.
            ctx.waitUntil(call(env, "/api/cron/sync-assets-webhook"));
        } else if (event.cron === "30 4 * * *") {
            // Re-sync the Helius wallet-assets webhook with newly linked wallets.
            // Kept as a daily belt-and-braces alongside the hourly call above.
            ctx.waitUntil(call(env, "/api/cron/sync-assets-webhook"));
        } else if (event.cron === "7 * * * *") {
            // AI market factory: auto-resolve due prediction markets and top the
            // board back up with generated markets (Workers AI, free tier).
            ctx.waitUntil(call(env, "/api/cron/predictions-factory"));
        } else if (event.cron === "*/10 * * * *") {
            // Callout leaderboard: advance peak gains + pay multiplier XP bonuses.
            ctx.waitUntil(call(env, "/api/cron/callout-performance"));
            // Settle pending server-witnessed trades on-chain (Phase 4a).
            ctx.waitUntil(call(env, "/api/cron/trade-verify"));
            // Rebuild realized-PnL snapshots from confirmed trades (Phase 4b).
            ctx.waitUntil(call(env, "/api/cron/pnl-snapshots"));
            // Weekly finish snapshots — route no-ops outside Monday 00:00–01:00
            // UTC, then writes the just-ended ISO week's board finishes once.
            ctx.waitUntil(call(env, "/api/cron/weekly-finishes"));
            // Close polls whose endsAt has passed, and drop expired stories.
            // Both were also never dispatched (see publish-scheduled above).
            // Ten-minute granularity is fine for both: a poll closing a few
            // minutes late changes nothing, and story expiry is a privacy
            // EXPECTATION rather than a guarantee to the minute — but "never"
            // is not late, it is broken.
            ctx.waitUntil(call(env, "/api/cron/end-polls"));
            ctx.waitUntil(call(env, "/api/cron/expire-stories"));
        } else if (event.cron === "* * * * *") {
            // Every minute — only the two the app treats as live market data.
            // Everything else moved to */5 on 2026-11-02: on Vercel Hobby each
            // call is a billed function run (plus a middleware run), and nine a
            // minute with zero users was ~390k a month — a third of the cap.
            // In-app swaps also trigger instant per-token refreshes, so this is
            // the fallback, not the source of truth for perceived latency.

            ctx.waitUntil(call(env, "/api/cron/token-sync"));

            // Coin alert feed (/home left rail): discovers tracked coins across
            // chains and clusters their swaps into "N traders bought" events.
            ctx.waitUntil(call(env, "/api/cron/coin-alerts"));
        } else if (event.cron === "*/5 * * * *") {
            // A few minutes of lag is invisible for these: live viewer counts,
            // the /trending board (a rotating slice of chains per pass), and
            // scheduled posts (publish within 5 min of their time).

            // Every minute — the CF cron floor. All three are cheap bounded
            // API-call passes; in-app swaps additionally trigger instant
            // per-token refreshes so this is the fallback, not the source of
            // truth for perceived latency.
            ctx.waitUntil(call(env, "/api/cron/ivs-viewers"));

            // Trending board (/trending): refreshes a rotating slice of chains.
            // Its budget and coin-alerts' deliberately sum under GeckoTerminal's
            // shared ~30 calls/min ceiling — see lib/coin-feed/geckoterminal.ts.
            ctx.waitUntil(call(env, "/api/cron/trending-sync"));

            // Scheduled posts. Every minute, not */10, because a post set for
            // 15:00 should appear at 15:00 — a ten-minute window is a visible
            // broken promise. One indexed UPDATE, so it is as cheap as the rest.
            //
            // This route EXISTED and was never dispatched: 18 routes under
            // app/api/cron, 14 called here. Cloudflare analytics showed zero
            // requests to it in 24h. Nothing failed loudly; scheduled posts
            // simply would have sat in `scheduled` forever.
            ctx.waitUntil(call(env, "/api/cron/publish-scheduled"));
            // Uptime monitor: 3 probes, one of them a full home-page render —
            // the costliest call here. An outage email now lands within ~10 min.
            ctx.waitUntil(runMonitor(env));
            // tape-watch is gone: it is a no-op until TAPE_WATCH_ENABLED=1, and
            // the Tape it fed was retired with the Cloudflare realtime worker.
        } else {
            ctx.waitUntil(call(env, "/api/cron/premium-collect"));

            // Turned on deliberately 2026-08-19, which is exactly the condition
            // the previous note here demanded. It refused to schedule the sweep
            // while TREASURY_EVM_ADDRESS was unset, on the grounds that an
            // inert schedule would start moving real money the day somebody set
            // that variable for an unrelated reason. The address is set now
            // (payingheavy.eth) and this is that decision, made on purpose.
            //
            // /api/cron/send-fee-sweep SIGNS TRANSACTIONS from each user's
            // seed-derived key, so the gas comes out of THAT USER's wallet.
            // A group worth less than 5x the gas to move it is left pending
            // rather than collected at the user's expense — see
            // lib/chains/send/sweep-threshold.ts. Without that floor a $10
            // mainnet send would burn dollars of their ETH to deliver $0.10.
            ctx.waitUntil(call(env, "/api/cron/send-fee-sweep"));
        }
    },
} satisfies ExportedHandler<Env>;
