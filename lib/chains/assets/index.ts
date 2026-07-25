// Asset provider registry.
//
// Solana is deliberately absent: it already has a mature pipeline in
// server/routers/wallet.ts getWalletAssets (Helius, hidden-token filtering,
// spam handling, NFTs). Re-implementing it here would be a downgrade, so the
// wallet UI keeps calling that for Solana and routes the other kinds here.

import { getChain } from "../registry";
import type { ChainId, ChainKind } from "../types";
import { bitcoinAssetProvider } from "./bitcoin";
import { evmAssetProvider } from "./evm";
import { suiAssetProvider } from "./sui";
import type { AssetFetchResult, AssetProvider } from "./types";

export const ASSET_PROVIDERS: Partial<Record<ChainKind, AssetProvider>> = {
  evm: evmAssetProvider,
  bitcoin: bitcoinAssetProvider,
  sui: suiAssetProvider,
};

/** True when this chain's assets come from lib/chains/assets rather than Helius. */
export function hasAssetProvider(chainId: string): boolean {
  const chain = getChain(chainId);
  return !!chain && !!ASSET_PROVIDERS[chain.kind];
}

export async function getAssetsForChain(
  chainId: ChainId,
  address: string
): Promise<AssetFetchResult> {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`unknown chain: ${chainId}`);

  const provider = ASSET_PROVIDERS[chain.kind];
  if (!provider) {
    throw new Error(`no asset provider for ${chainId} (kind ${chain.kind})`);
  }

  return provider.getAssets(address, chain);
}

export * from "./types";
