/**
 * Which pools can the trades webhook afford to watch?
 *
 * ## Why a budget instead of a count
 *
 * `MAX_DISPLAY_POOLS` was a COUNT, and a count is the wrong unit: pool cost
 * varies by three orders of magnitude. Measured on the live board, one pool
 * (HOOD, 230,975 txns/day) is 850 deliveries/min on its own — 37x an entire free
 * plan — while TROLL at 1,435/day is 1/min. "15 pools" therefore meant anything
 * between comfortable and 109x over, depending entirely on what was trending.
 *
 * So the knob is deliveries per minute, and pools are chosen to fit it.
 *
 * ## Cheapest-first, which is also the most pools
 *
 * Sorting ascending by cost and taking while the budget holds maximises the
 * NUMBER of pools watched — and pool count is what the data is for. A tape needs
 * breadth: `traderConcentration` wants 40+ trades per token across many tokens,
 * not millions of trades on one. The busiest pool on Solana buys one row of
 * `coin_trades` per credit and crowds out fifty quieter ones.
 *
 * The floor matters as much as the ceiling. A pool below `minTxns24h` is watched
 * for nothing: it never accumulates enough trades to reach a verdict, so it
 * spends budget producing samples too small to score.
 *
 * ## The ANY multiplier is why `mode` exists
 *
 * `transactionTypes: ["ANY"]` fires on every transaction touching a pool, not
 * just swaps — measured at **5.3x** the swap rate (478/min of swaps arrived as
 * 2,518/min of deliveries). ANY is only needed for OUR pools, because Helius's
 * enhanced parser doesn't classify Meteora DBC curve swaps as SWAP. Display
 * pools are ordinary AMM pairs where SWAP is exact.
 *
 * One Helius webhook carries one `transactionTypes`, so the mode is whole-list:
 * with no pools of our own it can be SWAP, which buys ~5x more display pools for
 * the same spend. The moment we launch a token it must become ANY, and the
 * budget then admits proportionally fewer — automatically, which is the point of
 * expressing this as a budget rather than a number somebody has to remember to
 * change.
 */

/** Measured 2026-08-09: deliveries under ANY ÷ actual swap rate. */
export const ANY_MULTIPLIER = 5.3;

export interface PoolCandidate {
    poolAddress: string | null;
    /** Swaps in the last 24h — GeckoTerminal's count, the basis for the estimate. */
    txns24h: number | null;
}

export interface BudgetOptions {
    /** Total deliveries/min the webhook may cost. */
    budgetPerMin: number;
    /** ANY costs `ANY_MULTIPLIER`x; SWAP is 1:1 with the swap count. */
    mode: "ANY" | "SWAP";
    /** Ignore pools too quiet to ever produce a scoreable sample. */
    minTxns24h: number;
}

export interface PoolSelection {
    addresses: string[];
    /** Estimated deliveries/min for the chosen set. */
    estPerMin: number;
    /** Candidates skipped for being below the activity floor. */
    tooQuiet: number;
    /** Candidates that would have fit no budget — each over it alone. */
    tooBusy: number;
}

/** Expected deliveries/min for one pool under `mode`. */
export function poolCostPerMin(txns24h: number | null | undefined, mode: "ANY" | "SWAP"): number {
    if (!Number.isFinite(txns24h ?? NaN) || (txns24h ?? 0) <= 0) return 0;
    const swapsPerMin = (txns24h as number) / 1440;
    return mode === "ANY" ? swapsPerMin * ANY_MULTIPLIER : swapsPerMin;
}

/**
 * Pick the largest set of pools whose combined estimated load fits the budget.
 *
 * Pure and total: no clock, no network, no throwing. Bad input (null addresses,
 * NaN counts) is skipped rather than crashing a cron.
 */
export function selectPoolsWithinBudget(
    candidates: readonly PoolCandidate[],
    opts: BudgetOptions,
): PoolSelection {
    const budget = Number.isFinite(opts.budgetPerMin) ? Math.max(0, opts.budgetPerMin) : 0;
    if (budget <= 0) return { addresses: [], estPerMin: 0, tooQuiet: 0, tooBusy: 0 };

    let tooQuiet = 0;
    const priced = candidates
        .filter((c): c is PoolCandidate & { poolAddress: string } => !!c.poolAddress)
        .map((c) => ({ address: c.poolAddress, cost: poolCostPerMin(c.txns24h, opts.mode), txns: c.txns24h ?? 0 }))
        .filter((p) => {
            if (p.txns < opts.minTxns24h) {
                tooQuiet++;
                return false;
            }
            return true;
        })
        // Cheapest first: maximises how many pools fit, and pool count is the
        // thing the tape is short of.
        .sort((a, b) => a.cost - b.cost);

    const addresses: string[] = [];
    const seen = new Set<string>();
    let spent = 0;
    let tooBusy = 0;

    for (const p of priced) {
        if (seen.has(p.address)) continue;
        if (spent + p.cost > budget) {
            // Sorted ascending, so everything after this is at least as
            // expensive — but keep counting for the log rather than breaking,
            // because "40 pools didn't fit" is the number that tells you the
            // budget is wrong.
            tooBusy++;
            continue;
        }
        seen.add(p.address);
        addresses.push(p.address);
        spent += p.cost;
    }

    return { addresses, estPerMin: spent, tooQuiet, tooBusy };
}
