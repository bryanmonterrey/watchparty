// Swap routing per chain.
//
// Coverage, deliberately explicit rather than silently absent:
//   Solana  → Jupiter, via the existing swap views. Not routed here.
//   EVM ×6  → LI.FI (keyless, covers Ethereum, Base, Polygon, BNB, HyperEVM,
//             Robinhood Chain).
//   Sui     → no keyless aggregator currently reachable (7K returns 522).
//   Bitcoin → no on-chain DEX exists; swapping needs a bridge.
//
// CROSS-CHAIN, from an EVM source into anything LI.FI reaches (every EVM chain
// above, plus Solana and Bitcoin) — see `crossChainSupport`. That is what makes
// "hold ETH on Base, buy a coin on BNB" one signature instead of a manual
// bridge, and it needed no new signing code, because a bridged route is still
// one transaction on the source chain.
//
// swapSupport() lets the UI disable the action with a real reason instead of
// offering a button that fails.

import { getChain } from "../registry";
import type { ChainId } from "../types";
import { executeLifiSwap, getLifiQuote } from "./lifi";
import type { SwapQuote, SwapQuoteRequest, SwapResult } from "./types";

export * from "./types";

export interface SwapSupport {
  supported: boolean;
  /** Why not, when unsupported — shown to the user. */
  reason?: string;
  provider?: "lifi" | "jupiter";
}

export function swapSupport(chainId: string): SwapSupport {
  const chain = getChain(chainId);
  if (!chain) return { supported: false, reason: "Unknown chain" };

  switch (chain.kind) {
    case "evm":
      return { supported: true, provider: "lifi" };
    case "solana":
      return { supported: true, provider: "jupiter" };
    case "sui":
      return { supported: false, reason: "No Sui aggregator is currently available" };
    case "bitcoin":
      return { supported: false, reason: "Bitcoin has no on-chain swaps" };
    default:
      return { supported: false, reason: `Swaps are unavailable on ${chain.name}` };
  }
}

/** Destinations LI.FI can bridge INTO. Wider than the set we can swap on:
 *  arriving somewhere needs no signer of ours, only a valid address. */
const BRIDGEABLE_KINDS = new Set(["evm", "solana", "bitcoin"]);

/**
 * Whether a token on `fromChain` can be spent to receive one on `toChain`.
 *
 * Same-chain defers to `swapSupport`. Cross-chain goes through LI.FI's bridge
 * routing, which is one transaction on the SOURCE chain — so what decides
 * feasibility is whether we can SIGN on the source, not whether the two chains
 * are related.
 *
 * Solana as a SOURCE is the asymmetry worth knowing: LI.FI quotes it happily
 * (SOL -> BNB via Relay, measured), but the route comes back as a base64
 * serialized Solana transaction rather than an EVM call, and `executeLifiSwap`
 * signs with viem. Quoting it and failing at signature would be worse than
 * saying so here.
 */
export function crossChainSupport(fromChain: string, toChain: string): SwapSupport {
  if (fromChain === toChain) return swapSupport(fromChain);

  const from = getChain(fromChain);
  const to = getChain(toChain);
  if (!from || !to) return { supported: false, reason: "Unknown chain" };

  if (from.kind !== "evm") {
    return {
      supported: false,
      reason:
        from.kind === "solana"
          ? "Bridging out of Solana isn't wired up yet — swap on Solana, or pay with a token on another chain"
          : `Can't bridge out of ${from.name}`,
    };
  }
  if (!BRIDGEABLE_KINDS.has(to.kind)) {
    return { supported: false, reason: `Can't bridge into ${to.name}` };
  }
  return { supported: true, provider: "lifi" };
}

export async function getSwapQuote(
  request: SwapQuoteRequest,
  fromAddress: string,
  /** Recipient on the destination chain. Required when bridging, because an
   *  EVM address cannot receive on Solana and vice versa. */
  toAddress?: string
): Promise<SwapQuote> {
  const support = crossChainSupport(request.chain, request.toChain ?? request.chain);
  if (!support.supported) throw new Error(support.reason ?? "Swaps unavailable");
  if (support.provider !== "lifi") {
    throw new Error("Solana swaps go through Jupiter, not this route");
  }
  return getLifiQuote(request, fromAddress, toAddress);
}

export async function executeSwap(seed: Uint8Array, quote: SwapQuote): Promise<SwapResult> {
  const support = crossChainSupport(quote.chain, quote.toChain ?? quote.chain);
  if (support.provider !== "lifi") throw new Error("Unsupported swap route");
  return executeLifiSwap(seed, quote);
}
