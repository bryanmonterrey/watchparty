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
        const res = await fetch(`${env.TARGET_BASE_URL}${path}`, {
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
            // Every minute — the CF cron floor. All three are cheap bounded
            // API-call passes; in-app swaps additionally trigger instant
            // per-token refreshes so this is the fallback, not the source of
            // truth for perceived latency.
            ctx.waitUntil(call(env, "/api/cron/ivs-viewers"));
            ctx.waitUntil(call(env, "/api/cron/token-sync"));
            // Coin alert feed (/home left rail): discovers tracked coins across
            // chains and clusters their swaps into "N traders bought" events.
            ctx.waitUntil(call(env, "/api/cron/coin-alerts"));
            // Re-point the Mobula trade socket at the coins that currently
            // matter — EVERY MINUTE, because it is free to do so.
            //
            // Mobula bills a socket per MINUTE OPEN, not per subscription or
            // message, and Tape.reconcile() sends the new payload on the
            // EXISTING connection rather than reconnecting. So swapping all 50
            // coins costs zero credits, and the only cost of doing it per
            // minute is one indexed query plus one call to the realtime worker.
            //
            // That is the inversion this whole move was for. `Helius` billed
            // per DELIVERY, so the watch list had to be picked cheapest-first
            // and a coin was EVICTED the moment it took off — the exact opposite
            // of what a live tape should follow. Here relevance is free, so the
            // list tracks 24h volume and re-picks on the same cadence as the
            // rest of the feed.
            //
            // No-ops when REALTIME_HOST/SECRET are unset, i.e. until the DO runs.
            ctx.waitUntil(call(env, "/api/cron/tape-watch"));
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
            // Uptime monitor — probes the live site (incl. a DB-touching tRPC
            // query) and emails on down/recovered transitions. See monitor.ts.
            ctx.waitUntil(runMonitor(env));
        } else {
            ctx.waitUntil(call(env, "/api/cron/premium-collect"));
            // NOT scheduled here, and the reason is stronger than caution.
            //
            // /api/cron/send-fee-sweep SIGNS TRANSACTIONS from each user's
            // seed-derived key to collect accrued 0.5% EVM send fees, with the
            // gas coming out of that user's wallet. Its own header says
            // "schedule alongside premium-collect".
            //
            // Verified 2026-08-11, and both halves matter:
            //   TREASURY_EVM_ADDRESS   NOT SET  -> the route returns
            //                                     {skipped} before doing anything
            //   send_fee_accruals      0 rows   -> nothing to sweep regardless
            //
            // So scheduling it today would be inert — which is exactly the
            // problem. An inert schedule means the sweep starts moving real
            // money on the day somebody sets TREASURY_EVM_ADDRESS for an
            // unrelated reason, with nobody having decided to turn it on.
            // Wiring it here turns a deliberate future choice into a side
            // effect of an env var. Schedule it WITH that decision, not before.
        }
    },
} satisfies ExportedHandler<Env>;
