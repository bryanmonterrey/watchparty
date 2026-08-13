// Trending board refresh — the writer behind /trending.
//
// Runs every minute on the existing "* * * * *" trigger, alongside token-sync
// and coin-alerts. Each pass refreshes a ROTATING SLICE of chains (see
// networksForPass) rather than the whole list, because GeckoTerminal's ~30
// calls/min ceiling is shared with the alert scan — a 20-chain sweep in one
// minute would 429 both. Four chains a minute turns the full list over every
// five minutes, which is well inside how fast a trending list actually moves.
import { NextRequest, NextResponse } from "next/server";
import { CallBudget, GT_TRENDING_BUDGET } from "@/lib/coin-feed/geckoterminal";
import { networksForPass, runTrendingSync, sourceForPass } from "@/lib/coin-feed/trending-sync";
import { TRENDING_NETWORKS } from "@/lib/coin-feed/networks";
import { runCandleSync, pruneCandles } from "@/lib/coins/candle-sync";
import { gtKeyed } from "@/lib/coins/gecko-endpoint";
import { MOBULA_TRENDING_CHAINS, syncTrendingChainFromMobula } from "@/lib/coin-feed/trending-mobula";
import { screenBoardLiquidity } from "@/server/lib/backfill-liquidity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ?all=1 sweeps every chain in one go — for seeding the board by hand, not
    // for the schedule (it will burn the whole minute's quota and likely 429).
    const sweepAll = req.nextUrl.searchParams.get("all") === "1";
    const networks = sweepAll ? TRENDING_NETWORKS : networksForPass();
    const budget = new CallBudget(sweepAll ? TRENDING_NETWORKS.length : GT_TRENDING_BUDGET);

    // The schedule alternates top/trending by the clock; ?source= pins it, which
    // is what you want with ?all=1 when seeding the board by hand.
    const requested = req.nextUrl.searchParams.get("source");
    const source = requested === "top" || requested === "trending" ? requested : sourceForPass();

    // ── Mobula first, for the chains it serves ───────────────────────────────
    //
    // OFF unless TRENDING_MOBULA_CHAINS is set, so this deploys inert and the
    // GeckoTerminal path below is untouched until the switch is thrown
    // deliberately. Set it to a comma-separated list, or `*` for all six.
    //
    // Why move at all: GT rate-limits per IP and Cloudflare's egress IP is
    // shared, so it fails outright from the Worker (docs/market-data-options.md).
    // And it carries NO holder data, which is the only thing that can separate
    // an impersonator from a real brand product — `preOPENAI` and `CBETH` match
    // the same name rule. Mobula returns both, one call per chain.
    //
    // COST: 6 chains x 1 call. Hourly = 4,320/month (fits the 10k free tier);
    // every 5 min = 51,840 (fits the $50 tier). This route runs per MINUTE, so
    // a chain is refreshed only when its slice comes round — see the modulo in
    // `networksForPass`. Widen deliberately, and re-check the arithmetic first.
    const mobulaEnv = process.env.TRENDING_MOBULA_CHAINS?.trim();
    const mobulaChains = !mobulaEnv
        ? []
        : mobulaEnv === "*"
          ? [...MOBULA_TRENDING_CHAINS]
          : mobulaEnv.split(",").map((c) => c.trim()).filter((c) => (MOBULA_TRENDING_CHAINS as readonly string[]).includes(c));

    // ── The cost dial ────────────────────────────────────────────────────────
    //
    // This route fires EVERY MINUTE. Running six chains on every pass is
    // 259,200 credits/month, which fits neither the free tier (10k) nor the $50
    // one (125k) — so the cadence is not a preference, it is what decides
    // whether the bill is payable:
    //
    //     every 60 min   6 x 24   =  4,320/month  -> free tier
    //     every  5 min   6 x 288  = 51,840/month  -> $50 tier
    //     every  1 min   6 x 1440 = 259,200/month -> neither
    //
    // Expressed as an interval rather than a boolean precisely so moving up a
    // tier is one number, and so the arithmetic above sits next to the knob it
    // describes. `?all=1` bypasses it for a manual seed.
    const everyMin = Math.max(1, Number(process.env.TRENDING_MOBULA_EVERY_MIN ?? 60) || 60);
    const dueThisPass = sweepAll || new Date().getUTCMinutes() % everyMin === 0;

    const mobulaResults: { chain: string; written: number }[] = [];
    for (const chain of dueThisPass ? mobulaChains : []) {
        try {
            const r = await syncTrendingChainFromMobula(chain);
            // null = provider off or chain unsupported. Falling through to GT
            // rather than blanking the chain is the point of returning null.
            if (r) mobulaResults.push({ chain: r.chain, written: r.written });
        } catch (err) {
            console.error(`[trending-sync] mobula ${chain} failed:`, err instanceof Error ? err.message : err);
        }
    }
    // ── Liquidity screen ─────────────────────────────────────────────────────
    //
    // The board cannot measure its own liquidity: the pairs endpoint's
    // `liquidity` is not dollars, so the sync above writes NULL deliberately and
    // the real figure only comes from the per-coin security screen. Nothing ran
    // that on a schedule, so `liquidity_usd` was NULL on 308 of 308 fresh rows
    // (2026-08-13) — which matters beyond a blank column: `clearsBrandBar` reads
    // it to decide whether a brand-squatting ticker has earned the alert rail.
    //
    // Rides the SAME `dueThisPass` gate as the board sync. The source is
    // DEXSCREENER (free, hundreds/min per IP) rather than Mobula's metered
    // per-coin endpoint, which refused ~75% of calls on the free key — so the
    // bound here is wall-clock inside this route's 120s ceiling, not money.
    // See the note on `screenBoardLiquidity`.
    //
    // `?screen=N` overrides it for a manual seed (bounded at 200), the same way
    // `?all=1` overrides the chain slice. 0 turns it off without a deploy.
    //
    // ⚠️ The raw string is checked for absence BEFORE Number(): a missing param
    // reads as null, and Number(null) is 0 — a finite, in-range number that
    // would have pinned the screen to "off" on every scheduled pass while
    // looking like a deliberate override.
    const screenRaw = req.nextUrl.searchParams.get("screen");
    const screenParam = screenRaw === null || screenRaw.trim() === "" ? NaN : Number(screenRaw);
    const screenPinned = Number.isFinite(screenParam) && screenParam >= 0;
    const screenPerPass = screenPinned
        ? Math.min(200, Math.floor(screenParam))
        // 60, not the original 20. That number was sized for a metered API at 1
        // credit a coin; the source is free now, and 5 live passes of 60 ran
        // with zero failures and `deadlineHit` false every time, so the only
        // real bound is the 45s in-pass deadline.
        : Math.max(0, Math.floor(Number(process.env.TRENDING_LIQUIDITY_SCREEN_PER_PASS ?? 60)) || 0);
    // An explicit ?screen= also bypasses the hourly gate — otherwise a manual
    // seed silently does nothing for 59 minutes out of every 60, which reads as
    // a broken endpoint rather than a scheduling rule.
    const liquidityScreen = (dueThisPass || screenPinned) && screenPerPass > 0
        ? await screenBoardLiquidity(screenPerPass)
        : null;

    // ── GeckoTerminal is OFF once Mobula is configured ───────────────────────
    //
    // Not "GT fills the chains Mobula doesn't serve". The owner's call, and the
    // measurements back it: GT ran a 23.5% HTTP 500 rate over a 6h window, it
    // fails outright from Cloudflare's shared egress IP
    // (docs/market-data-options.md), and it carries no holder data — so every
    // GT-sourced row is one the spam gate cannot judge. 217 of 503 rows were in
    // exactly that state: visible, unjudgeable, and indistinguishable from
    // "clean" to `isRiskyHoldings`, which fails open on nulls.
    //
    // A narrower board that can be filtered beats a wider one that cannot.
    //
    // Setting TRENDING_MOBULA_CHAINS is therefore the whole switch: GT keeps
    // running only while it is unset, which is what makes this reversible
    // without a deploy.
    const gtNetworks = mobulaChains.length > 0 ? [] : networks;

    try {
        const result = await runTrendingSync(budget, gtNetworks, source);

        // ── Candle PREFETCH is off once Mobula is on ─────────────────────
        //
        // This was the last GeckoTerminal caller in the write path, and it is
        // the one that could simply STOP rather than be ported.
        //
        // The chart read path (lib/tokens/udf-datafeed) already goes: our own
        // coin_candles -> Mobula -> GT, and it PERSISTS what Mobula returns. So
        // a coin someone opens populates itself, for free, on first view.
        //
        // Porting the prefetch instead would be the expensive option: Mobula's
        // OHLCV endpoint costs 5 CREDITS a call, not 1, so prefetching a
        // few-hundred-coin board is thousands of credits an hour to fill a
        // cache for coins nobody opened. docs/market-data-options.md already
        // reached this conclusion — "you do not need candles for every coin,
        // you need them for every coin someone opens" — and then kept the
        // prefetch anyway because GT calls were free.
        //
        // They are not free any more; they are just failing somewhere else.
        const candles = mobulaChains.length > 0
            ? { synced: 0, written: 0, skipped: "mobula: candles are fetch-on-open" as const }
            : await runCandleSync(new CallBudget(gtKeyed() ? 40 : 4));

        // Retention runs on the pass that turns the chain list over, so it's
        // once every five minutes rather than every minute.
        const pruned = sweepAll || networks[0]?.id === TRENDING_NETWORKS[0]?.id
            ? await pruneCandles()
            : 0;

        return NextResponse.json({
            ...result,
            mobula: mobulaResults,
            // Reported so a stalled screen is visible: repeated passes with
            // measured 0 and unmeasured N mean the head of the volume ordering
            // is unmeasurable and is being re-paid for every hour.
            liquidityScreen,
            callsSpent: budget.spent,
            candles,
            pruned,
        });
    } catch (err) {
        console.error("[trending-sync] pass failed:", err);
        return NextResponse.json({ error: "sync failed" }, { status: 500 });
    }
}
