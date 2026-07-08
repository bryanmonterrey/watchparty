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
  status: TokenStatus;
  tokenAddress?: string | null;
  poolAddress?: string | null;
  /** Creator is streaming on watchparty right now (Discover "Live" tab). */
  creatorIsLive: boolean;
  liveViewerCount: number;
  creatorUsername?: string | null;
}
