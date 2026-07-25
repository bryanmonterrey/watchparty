import type { ChainConfig, ChainId, ChainKind } from "../types";

/**
 * One holding on one chain, normalized across ecosystems.
 *
 * `balance` is the human-readable amount; `rawBalance` keeps the exact base
 * units as a string. Both exist on purpose — 18-decimal EVM values and satoshi
 * counts lose precision as JS numbers, so anything that moves funds must read
 * rawBalance, and only display reads balance.
 */
export interface ChainAsset {
  chain: ChainId;
  /** Contract / mint address. Null means the chain's native coin. */
  contract: string | null;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
  balance: number;
  rawBalance: string;
  price?: number;
  usdValue?: number;
  priceChange24h?: number;
  /** True when the amount is the native coin (SOL, ETH, BTC, SUI…). */
  isNative: boolean;
}

export interface AssetFetchResult {
  assets: ChainAsset[];
  totalUsd: number;
  /**
   * Set when holdings may be incomplete — e.g. an EVM chain without an indexer
   * key, where we can only see the curated token list. The UI should say so
   * rather than implying the user holds nothing else.
   */
  partial?: { reason: string };
}

export interface AssetProvider {
  kind: ChainKind;
  getAssets(address: string, chain: ChainConfig): Promise<AssetFetchResult>;
}
