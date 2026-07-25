// Activity provider registry.
//
// Solana is absent for the same reason it is in lib/chains/assets: the existing
// getTransactions procedure already parses Helius enhanced transactions with
// spam filtering, and a generic reimplementation would lose that.

import { getChain } from "../registry";
import type { ChainId, ChainKind } from "../types";
import { bitcoinActivityProvider } from "./bitcoin";
import { evmActivityProvider } from "./evm";
import { suiActivityProvider } from "./sui";
import type { ActivityProvider, ChainActivity } from "./types";

export * from "./types";

export const ACTIVITY_PROVIDERS: Partial<Record<ChainKind, ActivityProvider>> = {
  evm: evmActivityProvider,
  bitcoin: bitcoinActivityProvider,
  sui: suiActivityProvider,
};

export function hasActivityProvider(chainId: string): boolean {
  const chain = getChain(chainId);
  return !!chain && !!ACTIVITY_PROVIDERS[chain.kind];
}

export async function getActivityForChain(
  chainId: ChainId,
  address: string,
  limit = 25
): Promise<ChainActivity[]> {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`unknown chain: ${chainId}`);

  const provider = ACTIVITY_PROVIDERS[chain.kind];
  if (!provider) throw new Error(`no activity provider for ${chainId}`);

  return provider.getActivity(address, chain, limit);
}
