// Bitcoin balances via the mempool.space REST API — free, keyless, and the
// same source we use for fee estimation when sending.

import { BITCOIN } from "../registry";
import type { ChainConfig } from "../types";
import { getNativePrice } from "./prices";
import type { AssetFetchResult, AssetProvider, ChainAsset } from "./types";

interface AddressStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}

interface AddressResponse {
  chain_stats: AddressStats;
  mempool_stats: AddressStats;
}

/** Confirmed + unconfirmed balance, in satoshis. */
export async function getBitcoinBalanceSats(
  address: string,
  apiBase = BITCOIN.rpcUrl!
): Promise<bigint> {
  const res = await fetch(`${apiBase}/address/${address}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`mempool.space returned ${res.status}`);

  const data = (await res.json()) as AddressResponse;
  const confirmed =
    BigInt(data.chain_stats.funded_txo_sum) - BigInt(data.chain_stats.spent_txo_sum);
  const pending =
    BigInt(data.mempool_stats.funded_txo_sum) - BigInt(data.mempool_stats.spent_txo_sum);
  return confirmed + pending;
}

export const bitcoinAssetProvider: AssetProvider = {
  kind: "bitcoin",

  async getAssets(address: string, chain: ChainConfig): Promise<AssetFetchResult> {
    const [sats, quote] = await Promise.all([
      getBitcoinBalanceSats(address, chain.rpcUrl),
      getNativePrice("bitcoin"),
    ]);

    const balance = Number(sats) / 10 ** chain.nativeCurrency.decimals;
    const usdValue = quote ? balance * quote.price : undefined;

    const asset: ChainAsset = {
      chain: "bitcoin",
      contract: null,
      symbol: chain.nativeCurrency.symbol,
      name: "Bitcoin",
      decimals: chain.nativeCurrency.decimals,
      balance,
      rawBalance: sats.toString(),
      price: quote?.price,
      priceChange24h: quote?.priceChange24h,
      usdValue,
      isNative: true,
    };

    // Bitcoin has no token standard in scope here — one asset is the full picture.
    return { assets: [asset], totalUsd: usdValue ?? 0 };
  },
};
