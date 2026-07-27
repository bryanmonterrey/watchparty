// GeckoTerminal client for the coin alert feed.
//
// Same provider as lib/tokens/market-sync.ts (which syncs watchparty's OWN
// launches by pool address); this module adds the two things the alert feed
// needs on top of it:
//   • discovery  — trending_pools / new_pools per network, so we find coins we
//                  didn't launch
//   • trades     — swap-level rows per pool (trader address, side, USD), which
//                  is what makes "20 traders bought" possible at all
//
// Free tier, no key, ~30 calls/min. Every caller here goes through `gt()` so
// the call budget is enforced in ONE place — see CallBudget.

const BASE = "https://api.geckoterminal.com/api/v2";
const HEADERS = { Accept: "application/json;version=20230302" };
const TIMEOUT_MS = 10_000;

// GeckoTerminal's free tier is ~30 calls/min for the WHOLE APP, and two
// per-minute crons draw on it, so the ceiling is split between them rather than
// each assuming it owns the quota. Tripping the limiter 429s everything for the
// rest of the minute, so the two budgets below deliberately sum under 30.

/** Alert pass: discovery (≤2 per enabled chain, every 5 min) + one call per
 *  coin scanned. This number is also the alert latency dial — see MAX_TRACKED. */
export const GT_CALL_BUDGET = 20;

/** Trending pass: one call per chain, NETWORKS_PER_PASS chains per minute. */
export const GT_TRENDING_BUDGET = 5;

/** Spends a fixed number of API calls across a pass. Handed to each stage so
 *  discovery can't starve the trade scan (or vice versa). */
export class CallBudget {
    private used = 0;
    /** Set once the provider 429s. The pass should wind down rather than burn
     *  its remaining calls on requests that will also be rejected. */
    private limited = false;
    constructor(private readonly max: number = GT_CALL_BUDGET) {}
    get remaining() { return Math.max(0, this.max - this.used); }
    get spent() { return this.used; }
    get rateLimited() { return this.limited; }
    markRateLimited() { this.limited = true; }
    take(): boolean {
        if (this.limited || this.used >= this.max) return false;
        this.used++;
        return true;
    }
}

const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

/** One GT GET. Returns null on any failure — a bad call never kills a pass.
 *  A 429 additionally trips the budget's rate-limit flag, so callers can stop
 *  early AND can tell "the provider refused" apart from "there was nothing". */
async function gt<T>(path: string, budget: CallBudget): Promise<T | null> {
    if (!budget.take()) return null;
    try {
        const res = await fetch(`${BASE}${path}`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 429) {
            budget.markRateLimited();
            return null;
        }
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

// ─── Pools (discovery) ───────────────────────────────────────────────────────

type GtPoolRaw = {
    id?: string;
    attributes?: {
        address?: string;
        name?: string;
        base_token_price_usd?: string | null;
        market_cap_usd?: string | null;
        fdv_usd?: string | null;
        reserve_in_usd?: string | null;
        pool_created_at?: string | null;
        volume_usd?: Record<string, string>;
        price_change_percentage?: Record<string, string>;
        transactions?: Record<string, { buys?: number; sells?: number }>;
    };
    relationships?: {
        base_token?: { data?: { id?: string } };
        dex?: { data?: { id?: string } };
    };
};

type GtIncluded = {
    id?: string;
    type?: string;
    attributes?: { symbol?: string; name?: string; image_url?: string; address?: string };
};

/** Everything GT's pool payload carries. The alert watch list stores a subset;
 *  the trending board stores the rest. Parsing it all here costs nothing (it's
 *  the same response) and keeps one parser rather than two that drift. */
export type DiscoveredPool = {
    network: string;
    poolAddress: string;
    tokenAddress: string;
    dexId: string | null;
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    liquidityUsd: number | null;
    volume5mUsd: number | null;
    volume1hUsd: number | null;
    volume6hUsd: number | null;
    volume24hUsd: number | null;
    priceChange5m: number | null;
    priceChange1h: number | null;
    priceChange6h: number | null;
    priceChange24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
    poolCreatedAt: Date | null;
};

/** GT ids look like "solana_<address>"; the address is everything after the
 *  FIRST underscore (Solana base58 has none, EVM hex has none, but network
 *  slugs can — e.g. "arbitrum_nova"). */
const addressFromGtId = (id: string | undefined, network: string): string | null => {
    if (!id) return null;
    const prefix = `${network}_`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id.split("_").slice(1).join("_") || null;
};

function parsePools(json: { data?: GtPoolRaw[]; included?: GtIncluded[] }, network: string): DiscoveredPool[] {
    const tokenMeta = new Map<string, GtIncluded["attributes"]>();
    for (const inc of json.included ?? []) {
        if (inc.type === "token" && inc.id) tokenMeta.set(inc.id, inc.attributes);
    }

    const out: DiscoveredPool[] = [];
    for (const pool of json.data ?? []) {
        const a = pool.attributes;
        const poolAddress = a?.address;
        const baseId = pool.relationships?.base_token?.data?.id;
        const tokenAddress = addressFromGtId(baseId, network);
        if (!poolAddress || !tokenAddress) continue;

        const meta = baseId ? tokenMeta.get(baseId) : undefined;
        // `included` is only present when we ask for it; fall back to the pool
        // name ("PUPPY / SOL") so a row always has something to render.
        const symbol = meta?.symbol ?? a?.name?.split("/")[0]?.trim() ?? "";
        if (!symbol) continue;

        const created = a?.pool_created_at ? new Date(a.pool_created_at) : null;

        out.push({
            network,
            poolAddress,
            tokenAddress,
            dexId: pool.relationships?.dex?.data?.id ?? null,
            symbol: symbol.toUpperCase(),
            name: meta?.name ?? null,
            imageUrl: meta?.image_url && meta.image_url !== "missing.png" ? meta.image_url : null,
            priceUsd: num(a?.base_token_price_usd),
            marketCapUsd: num(a?.market_cap_usd) ?? num(a?.fdv_usd),
            fdvUsd: num(a?.fdv_usd),
            liquidityUsd: num(a?.reserve_in_usd),
            volume5mUsd: num(a?.volume_usd?.m5),
            volume1hUsd: num(a?.volume_usd?.h1),
            volume6hUsd: num(a?.volume_usd?.h6),
            volume24hUsd: num(a?.volume_usd?.h24),
            priceChange5m: num(a?.price_change_percentage?.m5),
            priceChange1h: num(a?.price_change_percentage?.h1),
            priceChange6h: num(a?.price_change_percentage?.h6),
            priceChange24h: num(a?.price_change_percentage?.h24),
            buys24h: a?.transactions?.h24?.buys ?? null,
            sells24h: a?.transactions?.h24?.sells ?? null,
            poolCreatedAt: created && !Number.isNaN(created.getTime()) ? created : null,
        });
    }
    return out;
}

/** Trending pools on a network — the main discovery source for "good coins". */
export async function fetchTrendingPools(network: string, budget: CallBudget, page = 1): Promise<DiscoveredPool[]> {
    const json = await gt<{ data?: GtPoolRaw[]; included?: GtIncluded[] }>(
        `/networks/${network}/trending_pools?include=base_token,dex&page=${page}&duration=1h`,
        budget,
    );
    return json ? parsePools(json, network) : [];
}

/** Freshly created pools — catches a runner before it trends. */
export async function fetchNewPools(network: string, budget: CallBudget): Promise<DiscoveredPool[]> {
    const json = await gt<{ data?: GtPoolRaw[]; included?: GtIncluded[] }>(
        `/networks/${network}/new_pools?include=base_token,dex&page=1`,
        budget,
    );
    return json ? parsePools(json, network) : [];
}

/** Refresh market columns for up to 30 pools in one call (GT's multi cap). */
export async function fetchPoolsByAddress(
    network: string,
    poolAddresses: string[],
    budget: CallBudget,
): Promise<DiscoveredPool[]> {
    if (poolAddresses.length === 0) return [];
    const json = await gt<{ data?: GtPoolRaw[]; included?: GtIncluded[] }>(
        `/networks/${network}/pools/multi/${poolAddresses.slice(0, 30).join(",")}?include=base_token,dex`,
        budget,
    );
    return json ? parsePools(json, network) : [];
}

// ─── Trades (the cluster source) ─────────────────────────────────────────────

type GtTradeRaw = {
    attributes?: {
        block_number?: number;
        tx_hash?: string;
        tx_from_address?: string;
        block_timestamp?: string;
        kind?: string;                 // "buy" | "sell" (relative to the base token)
        volume_in_usd?: string;
        price_to_in_usd?: string;
        price_from_in_usd?: string;
    };
};

export type PoolTrade = {
    txHash: string;
    trader: string;
    side: "buy" | "sell";
    usd: number;
    at: Date;
    priceUsd: number | null;
};

/**
 * Recent swaps on a pool. GT returns the last 300 trades of the past 24h,
 * newest first, and `minUsd` filters server-side so the dust never costs us
 * parsing (or dilutes a cluster's trader count).
 *
 * Returns **null when the call itself failed** (429, timeout, 5xx) as opposed
 * to an empty array for "this pool genuinely had no qualifying trades". The
 * caller must not advance the coin's scan cursor on null — treating a refused
 * request as "nothing happened" silently marks coins as scanned that were never
 * read, and with the staleness-weighted ordering it sends them to the back of
 * the queue.
 */
export async function fetchPoolTrades(
    network: string,
    poolAddress: string,
    budget: CallBudget,
    minUsd = 0,
): Promise<PoolTrade[] | null> {
    const json = await gt<{ data?: GtTradeRaw[] }>(
        `/networks/${network}/pools/${poolAddress}/trades?trade_volume_in_usd_greater_than=${minUsd}`,
        budget,
    );
    if (!json) return null;
    if (!json.data) return [];

    const out: PoolTrade[] = [];
    for (const row of json.data) {
        const a = row.attributes;
        const trader = a?.tx_from_address;
        const ts = a?.block_timestamp;
        const usd = num(a?.volume_in_usd);
        if (!trader || !ts || usd == null) continue;
        const at = new Date(ts);
        if (Number.isNaN(at.getTime())) continue;
        out.push({
            txHash: a?.tx_hash ?? `${poolAddress}-${ts}-${trader}`,
            // EVM hex is case-insensitive and GT mixes checksummed/lowercase
            // forms, so fold it; Solana base58 is case-SENSITIVE and must be
            // left exactly as-is or it stops matching linked_wallets.
            trader: trader.startsWith("0x") ? trader.toLowerCase() : trader,
            side: a?.kind === "sell" ? "sell" : "buy",
            usd,
            at,
            // For a buy the base token is what's received (price_to); for a
            // sell it's what's given (price_from).
            priceUsd: a?.kind === "sell" ? num(a?.price_from_in_usd) : num(a?.price_to_in_usd),
        });
    }
    return out;
}
