// Chain registry for the coin alert feed.
//
// Adding a chain is a row here — nothing downstream is chain-specific. `id` is
// the GeckoTerminal network slug (the market-data source already wired for
// `tokens`); GT covers ~200 networks, so breadth is a budget question, not a
// plumbing one.
//
// BUDGET is the real constraint: GeckoTerminal's free tier is 30 calls/min and
// the alert cron runs every minute. Each enabled network costs 1 discovery call
// per discovery pass, and every tracked coin costs 1 call per trade scan. So
// enabling a chain shrinks the per-coin scan rate for every other chain. Turn
// them on as coverage is actually wanted, not speculatively.

export type CoinNetwork = {
    /** GeckoTerminal network slug — also the `network` column value. */
    id: string;
    /** Lowercase display label for the rail's filter UI. */
    label: string;
    /** Off = not discovered and not scanned; existing rows stay put, unread. */
    enabled: boolean;
    /** Minimum pool liquidity for a coin to be worth tracking at all. Chains
     *  with cheap blockspace need a higher floor to keep the junk out. */
    minLiquidityUsd: number;
    /** Minimum 24h volume for discovery to adopt a coin. */
    minVolume24hUsd: number;
};

export const COIN_NETWORKS: CoinNetwork[] = [
    {
        id: "solana",
        label: "solana",
        enabled: true,
        minLiquidityUsd: 15_000,
        minVolume24hUsd: 50_000,
    },
    {
        id: "base",
        label: "base",
        enabled: true,
        minLiquidityUsd: 25_000,
        minVolume24hUsd: 75_000,
    },
    // Ready to switch on once the Solana/Base pass is proven and the call
    // budget below has room. Each one costs discovery + scan calls per minute.
    {
        id: "eth",
        label: "ethereum",
        enabled: false,
        minLiquidityUsd: 100_000,
        minVolume24hUsd: 250_000,
    },
    {
        id: "bsc",
        label: "bnb",
        enabled: false,
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 150_000,
    },
    {
        id: "arbitrum",
        label: "arbitrum",
        enabled: false,
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 150_000,
    },
    {
        id: "hyperevm",
        label: "hyperliquid",
        enabled: false,
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 150_000,
    },
];

/**
 * Coins that are never alert-worthy, however much they trade.
 *
 * Learned from the first live pass: CBBTC (wrapped BTC, $6.2B) produced
 * "85 traders sell $380K" — technically true, completely uninteresting, and it
 * would fire on EVERY scan because a blue chip always has that many traders in
 * a 15-minute window. Left in, majors and stables crowd out the memecoin
 * activity the rail exists to surface.
 *
 * Two filters, because neither alone is enough: the cap ceiling catches
 * established assets generically, and the symbol list catches stablecoins,
 * whose caps are enormous and whose "clusters" are pure plumbing.
 */
export const MAX_MARKET_CAP_USD = 2_000_000_000;

export const EXCLUDED_SYMBOLS = new Set([
    // stables
    "USDC", "USDT", "DAI", "USDS", "USDE", "SUSDE", "FDUSD", "PYUSD", "USD1",
    "TUSD", "USDD", "FRAX", "LUSD", "GUSD", "EURC", "USDG", "RLUSD",
    // majors + their wrapped/staked forms
    "WETH", "ETH", "WBTC", "CBBTC", "TBTC", "BTC", "WBNB", "BNB",
    "SOL", "WSOL", "JITOSOL", "MSOL", "BSOL", "JUPSOL",
    "STETH", "WSTETH", "RETH", "WEETH", "EZETH", "CBETH", "RSETH",
]);

/** True when a coin should never enter the watch list / alert feed. */
export function isExcludedCoin(symbol: string, marketCapUsd: number | null | undefined): boolean {
    if (EXCLUDED_SYMBOLS.has(symbol.toUpperCase())) return true;
    return marketCapUsd != null && marketCapUsd > MAX_MARKET_CAP_USD;
}

/**
 * Chains the TRENDING page covers — deliberately much wider than the alert
 * feed's `enabled` set.
 *
 * The two lists differ because the work differs by orders of magnitude. Alerts
 * scan trades PER COIN (1 call per coin per pass), so each chain there is
 * expensive and takes budget from every other chain. Trending only needs a
 * chain's trending-pools list (1 call per chain per refresh), so covering 20
 * chains costs 20 calls total — affordable, and it's what "overall crypto
 * atmosphere" actually requires.
 *
 * Slugs are GeckoTerminal's. A wrong or retired slug degrades gracefully: the
 * request 404s, `gt()` returns null, and that chain is simply skipped.
 */
export const TRENDING_NETWORKS: { id: string; label: string }[] = [
    { id: "solana", label: "solana" },
    { id: "eth", label: "ethereum" },
    { id: "base", label: "base" },
    { id: "bsc", label: "bnb" },
    { id: "arbitrum", label: "arbitrum" },
    { id: "polygon_pos", label: "polygon" },
    { id: "avax", label: "avalanche" },
    { id: "optimism", label: "optimism" },
    { id: "ton", label: "ton" },
    { id: "sui-network", label: "sui" },
    { id: "aptos", label: "aptos" },
    // "sei-network", NOT "sei-v2" — the latter 404s (verified against GT).
    { id: "sei-network", label: "sei" },
    { id: "hyperevm", label: "hyperliquid" },
    { id: "berachain", label: "berachain" },
    { id: "blast", label: "blast" },
    { id: "linea", label: "linea" },
    { id: "tron", label: "tron" },
    { id: "unichain", label: "unichain" },
    { id: "sonic", label: "sonic" },
    { id: "abstract", label: "abstract" },
];

const TRENDING_BY_ID = new Map(TRENDING_NETWORKS.map((n) => [n.id, n]));
const BY_ID = new Map(COIN_NETWORKS.map((n) => [n.id, n]));

/** Display label for any chain slug, trending-only ones included. */
export const chainLabel = (id: string) =>
    BY_ID.get(id)?.label ?? TRENDING_BY_ID.get(id)?.label ?? id;

/** Per-chain block explorer for a token address. Covers the trending list, not
 *  just the alert chains — otherwise most rows on the board would be dead. */
const EXPLORERS: Record<string, (a: string) => string> = {
    solana: (a) => `https://solscan.io/token/${a}`,
    eth: (a) => `https://etherscan.io/token/${a}`,
    base: (a) => `https://basescan.org/token/${a}`,
    bsc: (a) => `https://bscscan.com/token/${a}`,
    arbitrum: (a) => `https://arbiscan.io/token/${a}`,
    polygon_pos: (a) => `https://polygonscan.com/token/${a}`,
    avax: (a) => `https://snowtrace.io/token/${a}`,
    optimism: (a) => `https://optimistic.etherscan.io/token/${a}`,
    ton: (a) => `https://tonviewer.com/${a}`,
    "sui-network": (a) => `https://suivision.xyz/coin/${a}`,
    aptos: (a) => `https://explorer.aptoslabs.com/coin/${a}`,
    "sei-network": (a) => `https://seitrace.com/token/${a}`,
    hyperevm: (a) => `https://hyperevmscan.io/token/${a}`,
    berachain: (a) => `https://berascan.com/token/${a}`,
    blast: (a) => `https://blastscan.io/token/${a}`,
    linea: (a) => `https://lineascan.build/token/${a}`,
    tron: (a) => `https://tronscan.org/#/token20/${a}`,
    unichain: (a) => `https://uniscan.xyz/token/${a}`,
    sonic: (a) => `https://sonicscan.org/token/${a}`,
    abstract: (a) => `https://abscan.org/token/${a}`,
};

/**
 * Explorer link for a coin, or null when we don't know the chain.
 *
 * GeckoTerminal's own pool page is the fallback: it exists for every network GT
 * indexes by definition, so a chain we haven't mapped still gets a working
 * link rather than an inert row.
 */
export function explorerUrl(network: string, tokenAddress: string, poolAddress?: string | null): string | null {
    const explorer = EXPLORERS[network];
    if (explorer) return explorer(tokenAddress);
    if (poolAddress) return `https://www.geckoterminal.com/${network}/pools/${poolAddress}`;
    return null;
}

export const enabledNetworks = () => COIN_NETWORKS.filter((n) => n.enabled);

export const networkById = (id: string): CoinNetwork | undefined => BY_ID.get(id);

/** Display label for a network slug we may no longer have a row for. */
export const networkLabel = (id: string) => BY_ID.get(id)?.label ?? id;

export const trackedTokenId = (network: string, tokenAddress: string) =>
    `${network}:${tokenAddress}`;
