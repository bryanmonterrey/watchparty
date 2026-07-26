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
    /** Block explorer base for a token address (deep-link on non-Solana rows,
     *  where we have no native coin page). */
    explorerTokenUrl?: (address: string) => string;
};

export const COIN_NETWORKS: CoinNetwork[] = [
    {
        id: "solana",
        label: "solana",
        enabled: true,
        minLiquidityUsd: 15_000,
        minVolume24hUsd: 50_000,
        explorerTokenUrl: (a) => `https://solscan.io/token/${a}`,
    },
    {
        id: "base",
        label: "base",
        enabled: true,
        minLiquidityUsd: 25_000,
        minVolume24hUsd: 75_000,
        explorerTokenUrl: (a) => `https://basescan.org/token/${a}`,
    },
    // Ready to switch on once the Solana/Base pass is proven and the call
    // budget below has room. Each one costs discovery + scan calls per minute.
    {
        id: "eth",
        label: "ethereum",
        enabled: false,
        minLiquidityUsd: 100_000,
        minVolume24hUsd: 250_000,
        explorerTokenUrl: (a) => `https://etherscan.io/token/${a}`,
    },
    {
        id: "bsc",
        label: "bnb",
        enabled: false,
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 150_000,
        explorerTokenUrl: (a) => `https://bscscan.com/token/${a}`,
    },
    {
        id: "arbitrum",
        label: "arbitrum",
        enabled: false,
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 150_000,
        explorerTokenUrl: (a) => `https://arbiscan.io/token/${a}`,
    },
    {
        id: "hyperevm",
        label: "hyperliquid",
        enabled: false,
        minLiquidityUsd: 50_000,
        minVolume24hUsd: 150_000,
    },
];

const BY_ID = new Map(COIN_NETWORKS.map((n) => [n.id, n]));

export const enabledNetworks = () => COIN_NETWORKS.filter((n) => n.enabled);

export const networkById = (id: string): CoinNetwork | undefined => BY_ID.get(id);

/** Display label for a network slug we may no longer have a row for. */
export const networkLabel = (id: string) => BY_ID.get(id)?.label ?? id;

export const trackedTokenId = (network: string, tokenAddress: string) =>
    `${network}:${tokenAddress}`;
