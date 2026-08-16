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

/** Pure plumbing on any surface: a stablecoin pool sits at the top of every
 *  volume sort and tells you nothing. */
export const STABLE_SYMBOLS = new Set([
    "USDC", "USDT", "DAI", "USDS", "USDE", "SUSDE", "FDUSD", "PYUSD", "USD1",
    "TUSD", "USDD", "FRAX", "LUSD", "GUSD", "EURC", "USDG", "RLUSD",
]);

/** Majors and their wrapped/staked forms. Excluded from ALERTS (see above) but
 *  deliberately kept on the trending board — a "whole ecosystem top coins" list
 *  without ETH or SOL in it isn't the list. */
export const MAJOR_SYMBOLS = new Set([
    "WETH", "ETH", "WBTC", "CBBTC", "TBTC", "BTC", "WBNB", "BNB",
    "SOL", "WSOL", "JITOSOL", "MSOL", "BSOL", "JUPSOL",
    "STETH", "WSTETH", "RETH", "WEETH", "EZETH", "CBETH", "RSETH",
]);

export const EXCLUDED_SYMBOLS = new Set([...STABLE_SYMBOLS, ...MAJOR_SYMBOLS]);

/** True when a coin should never enter the watch list / alert feed. */
export function isExcludedCoin(symbol: string, marketCapUsd: number | null | undefined): boolean {
    if (EXCLUDED_SYMBOLS.has(symbol.toUpperCase())) return true;
    return marketCapUsd != null && marketCapUsd > MAX_MARKET_CAP_USD;
}

/**
 * The BOARD's exclusion — stables only, and no cap ceiling.
 *
 * The alert feed and the board want opposite things from the same data. Alerts
 * are a memecoin-activity rail, so a blue chip is noise. The board is the
 * ecosystem's top coins, so a blue chip is the point; running `isExcludedCoin`
 * here is what kept BTC/ETH/SOL off it.
 */
export function isBoardExcluded(symbol: string): boolean {
    return STABLE_SYMBOLS.has(symbol.toUpperCase());
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
    // Synced via Mobula Pulse, not GT (see trending-mobula) — listed here so
    // the board's chain filter and chainLabel know it.
    { id: "robinhood", label: "robinhood" },
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
    // Blockscout (Arbitrum Orbit) — from the chain registry's explorer field.
    robinhood: (a) => `https://explorer.chain.robinhood.com/token/${a}`,
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

/**
 * Where a row's "buy" goes for a chain we can't swap in-app (everything but
 * Solana, which routes through Jupiter in the wallet).
 *
 * GeckoTerminal's pool page rather than the block explorer: an explorer shows
 * you a token, a pool page links straight through to the DEX the liquidity
 * actually lives on. It exists for every network GT indexes, so unlike
 * `explorerUrl` this never has to return null.
 */
export function tradeUrl(network: string, tokenAddress: string, poolAddress?: string | null): string {
    if (poolAddress) return `https://www.geckoterminal.com/${network}/pools/${poolAddress}`;
    return `https://www.geckoterminal.com/${network}/tokens/${tokenAddress}`;
}

export const enabledNetworks = () => COIN_NETWORKS.filter((n) => n.enabled);

export const networkById = (id: string): CoinNetwork | undefined => BY_ID.get(id);

/** Display label for a network slug we may no longer have a row for. */
export const networkLabel = (id: string) => BY_ID.get(id)?.label ?? id;

export const trackedTokenId = (network: string, tokenAddress: string) =>
    `${network}:${tokenAddress}`;

/**
 * Board slug -> wallet chain id, i.e. "can this row actually be bought".
 *
 * THREE id spaces meet in `trending_coins.network`, and the buy path needs the
 * third:
 *   - GeckoTerminal's slugs (`eth`, `bsc`, `polygon_pos`) on rows written by
 *     the GT sweep — `source` is null on those;
 *   - MOBULA_TRENDING_CHAINS (`ethereum`, `bnb`, `polygon`) on rows written by
 *     the Mobula sync, which happen to match the registry already;
 *   - the wallet registry's ids, which own the RPC, explorer, native currency
 *     and derivation path, and are what a swap actually needs.
 *
 * BOTH source spellings must be listed, because both are live in the same
 * column at the same time. Measured 2026-08-16: `bnb` 144 rows / `ethereum` 92
 * / `polygon` 60 from Mobula, against `bsc` 35 / `eth` 19 / `polygon_pos` 14
 * from GT. Mapping only the GT spellings — as this first did — left the
 * MAJORITY of the board unbuyable while looking correct, since the chains that
 * spell the same in both (`solana`, `base`, `robinhood`, `hyperevm`) worked
 * fine and hid it.
 *
 * A slug absent from this map is a chain we can SHOW but not FILL — the board
 * trends ~20 chains and the wallet holds keys for 8, so most rows are display
 * only, and the buy UI has to say so rather than offering a button that throws.
 * Adding a chain here is a lie unless `lib/chains/registry.ts` has it too.
 */
const BUYABLE_CHAIN_BY_SLUG: Record<string, string> = {
    // Same in every space.
    solana: "solana",
    base: "base",
    hyperevm: "hyperevm",
    robinhood: "robinhood",
    // GeckoTerminal spelling -> registry id.
    eth: "ethereum",
    bsc: "bnb",
    polygon_pos: "polygon",
    // Mobula spelling (already registry-shaped, but must be listed explicitly
    // — a missing key here is silently "not buyable", not an error).
    ethereum: "ethereum",
    bnb: "bnb",
    polygon: "polygon",
};

/** The wallet chain id for a board slug, or null when the row is display-only. */
export const buyableChainId = (slug: string): string | null =>
    BUYABLE_CHAIN_BY_SLUG[slug] ?? null;
