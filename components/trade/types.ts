export type TokenStatus = "new" | "migrating" | "migrated";
export type TokenPlatform = "pumpfun" | "raydium" | "meteora" | "other";

export interface TradeToken {
  id: string;
  name: string;
  symbol: string;
  imageUrl: string;
  platform: TokenPlatform;
  timeAgo: string;
  hasSocials: {
    twitter?: string;
    website?: string;
  };
  holderCount: number;
  txCount: number;
  bondingProgress: number; // 0-100
  solAmount: number;
  priceUsd: number;
  marketCap: number;
  volume: number;
  buyPercent: number;
  sellPercent: number;
  changePercent: number;
  /** short-window deltas (null until the sync has seen the window) */
  changePercent5m: number | null;
  changePercent1h: number | null;
  changePercent6h: number | null;
  volume5m: number | null;
  volume1h: number | null;
  status: TokenStatus;
  tokenAddress?: string | null;
  poolAddress?: string | null;
  /** Creator is streaming on watchparty right now (Discover "Live" tab). */
  creatorIsLive: boolean;
  liveViewerCount: number;
  creatorUsername?: string | null;
  /** Epoch ms the coin/pair was created — what the "newest" sort orders by. */
  createdAtMs?: number | null;
  /** Chain id for rows from the chain-wide feed; absent = in-house coin. */
  chain?: string;
  /** True for chain-wide (Mobula) rows: routes to /coin/<chain>/<address>,
   *  and off Solana hides quick-buy (the swap engine only speaks Solana). */
  external?: boolean;
}
