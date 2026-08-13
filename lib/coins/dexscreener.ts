// Dexscreener client — the fallback source for coins we don't track.
//
// Why this and not GeckoTerminal (which the alert feed and market-sync use):
//
//   • It answers a BARE TOKEN ADDRESS with the chain included in the response.
//     GT's only no-chain lookup is /search/pools, which also matches symbols and
//     names, so it needs filtering and can rank the wrong pool first.
//   • Its limits are per-IP and in the hundreds/min, where GT's free tier is
//     ~30 calls/MINUTE for the whole app — shared with two per-minute crons.
//     A user-facing page must not draw on that budget.
//
// GT stays where it is. This is only the read path for a coin nobody here has
// indexed, so the two never compete.

const BASE = "https://api.dexscreener.com/latest/dex";
const TIMEOUT_MS = 8_000;

/**
 * Dexscreener's chain ids → the network slugs this app stores.
 *
 * Ours came from GeckoTerminal, and the two vendors disagree on several chains
 * ("ethereum" vs "eth", "avalanche" vs "avax"). Anything not listed passes
 * through unchanged — the two agree far more often than not, and an unknown
 * chain is better stored under its own name than dropped.
 */
const CHAIN_TO_NETWORK: Record<string, string> = {
    ethereum: "eth",
    avalanche: "avax",
    polygon: "polygon_pos",
    sui: "sui-network",
    sei: "sei-network",
};

type DsPair = {
    chainId?: string;
    dexId?: string;
    pairAddress?: string;
    baseToken?: { address?: string; name?: string; symbol?: string };
    priceUsd?: string;
    txns?: Record<string, { buys?: number; sells?: number }>;
    volume?: Record<string, number>;
    priceChange?: Record<string, number>;
    liquidity?: { usd?: number };
    fdv?: number;
    marketCap?: number;
    info?: { imageUrl?: string };
};

export type DexPair = {
    network: string;
    poolAddress: string;
    tokenAddress: string;
    dexId: string | null;
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    priceChange24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
};

const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Lower-case EVM addresses, leave everything else alone.
 *
 * Verified against a live response: Dexscreener returns EVM addresses
 * CHECKSUMMED (`0xC02aaA39…`) while our tables hold what GeckoTerminal gave us,
 * which is lower-case. Storing one and looking up the other silently misses.
 *
 * The `0x` guard is the whole point — Solana mints are base58 and case is
 * MEANINGFUL there, so a blanket toLowerCase() would corrupt them.
 */
export function normalizeAddress(address: string): string {
    return /^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : address;
}

/** One DsPair → DexPair, or null when the pair is missing identity fields. */
function mapPair(p: DsPair): DexPair | null {
    const tokenAddress = p.baseToken?.address;
    const poolAddress = p.pairAddress;
    const symbol = p.baseToken?.symbol;
    if (!tokenAddress || !poolAddress || !symbol || !p.chainId) return null;
    return {
        network: CHAIN_TO_NETWORK[p.chainId] ?? p.chainId,
        poolAddress,
        tokenAddress: normalizeAddress(tokenAddress),
        dexId: p.dexId ?? null,
        symbol: symbol.toUpperCase(),
        name: p.baseToken?.name ?? null,
        imageUrl: p.info?.imageUrl ?? null,
        priceUsd: num(p.priceUsd),
        marketCapUsd: num(p.marketCap) ?? num(p.fdv),
        liquidityUsd: num(p.liquidity?.usd),
        volume24hUsd: num(p.volume?.h24),
        priceChange24h: num(p.priceChange?.h24),
        buys24h: p.txns?.h24?.buys ?? null,
        sells24h: p.txns?.h24?.sells ?? null,
    };
}

/**
 * Every pair Dexscreener knows for a token address, across every chain,
 * DEEPEST LIQUIDITY FIRST.
 *
 * A token typically has several pairs and the vendor's order isn't
 * liquidity-ranked; the deepest one is the one whose price and chart are worth
 * showing. Returns [] on any failure — a coin page falling back to "not found"
 * is correct behaviour for an upstream that didn't answer.
 */
export async function fetchTokenPairs(address: string): Promise<DexPair[]> {
    let json: { pairs?: DsPair[] | null } | null = null;
    try {
        const res = await fetch(`${BASE}/tokens/${encodeURIComponent(address)}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return [];
        json = await res.json();
    } catch {
        return [];
    }

    const wanted = normalizeAddress(address).toLowerCase();

    const out: DexPair[] = [];
    for (const p of json?.pairs ?? []) {
        const mapped = mapPair(p);
        if (!mapped) continue;

        // The queried address must be the pair's BASE token. Dexscreener returns
        // pairs where it's the quote side too (every SOL pair, say), and those
        // describe a different coin entirely.
        //
        // Compared case-insensitively because the response is checksummed and
        // the query usually isn't; STORED via normalizeAddress so what we write
        // matches what the rest of our tables hold.
        if (mapped.tokenAddress.toLowerCase() !== wanted) continue;

        out.push(mapped);
    }

    // `info` (and so the logo) is present on only a minority of pairs — 8 of 30
    // on the live response I checked. They all describe the SAME token, so one
    // pair's image is every pair's image; without this the coin usually renders
    // logoless purely because its deepest pool happened to lack the block.
    const image = out.find((p) => p.imageUrl)?.imageUrl ?? null;
    if (image) for (const p of out) p.imageUrl ??= image;

    return out.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

/**
 * Free-text token search — the GLOBAL half of the app's coin search: name or
 * ticker matches against every token Dexscreener indexes, not just coins we
 * launched or track.
 *
 * ONE ROW PER TOKEN, not per pair: /search answers with every matching venue,
 * so a popular coin arrives a dozen times. Vendor ranking (first appearance)
 * decides the order; within a token the deepest-liquidity pair supplies the
 * numbers, and any sibling pair's logo fills a missing one, same as
 * fetchTokenPairs. Returns [] on any failure — search degrades, it never
 * throws.
 */
export async function searchPairs(query: string, limit = 10): Promise<DexPair[]> {
    let json: { pairs?: DsPair[] | null } | null = null;
    try {
        const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return [];
        json = await res.json();
    } catch {
        return [];
    }

    const byToken = new Map<string, DexPair>();
    for (const p of json?.pairs ?? []) {
        const mapped = mapPair(p);
        if (!mapped) continue;
        const id = `${mapped.network}:${mapped.tokenAddress.toLowerCase()}`;
        const prev = byToken.get(id);
        if (!prev) {
            byToken.set(id, mapped);
        } else if ((mapped.liquidityUsd ?? 0) > (prev.liquidityUsd ?? 0)) {
            mapped.imageUrl ??= prev.imageUrl;
            byToken.set(id, mapped);
        } else {
            prev.imageUrl ??= mapped.imageUrl;
        }
    }
    return [...byToken.values()].slice(0, limit);
}
