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

    const out: DexPair[] = [];
    for (const p of json?.pairs ?? []) {
        const tokenAddress = p.baseToken?.address;
        const poolAddress = p.pairAddress;
        const symbol = p.baseToken?.symbol;
        if (!tokenAddress || !poolAddress || !symbol || !p.chainId) continue;

        // The queried address must be the pair's BASE token. Dexscreener returns
        // pairs where it's the quote side too (every SOL pair, say), and those
        // describe a different coin entirely.
        if (tokenAddress.toLowerCase() !== address.toLowerCase()) continue;

        out.push({
            network: CHAIN_TO_NETWORK[p.chainId] ?? p.chainId,
            poolAddress,
            tokenAddress,
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
        });
    }

    return out.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}
