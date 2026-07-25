// Swap routing per chain.
//
// Coverage, deliberately explicit rather than silently absent:
//   Solana  → Jupiter, via the existing swap views. Not routed here.
//   EVM ×5  → LI.FI (keyless, covers Ethereum, Base, Polygon, HyperEVM,
//             Robinhood Chain).
//   Sui     → no keyless aggregator currently reachable (7K returns 522).
//   Bitcoin → no on-chain DEX exists; swapping needs a bridge.
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

export async function getSwapQuote(
  request: SwapQuoteRequest,
  fromAddress: string
): Promise<SwapQuote> {
  const support = swapSupport(request.chain);
  if (!support.supported) throw new Error(support.reason ?? "Swaps unavailable");
  if (support.provider !== "lifi") {
    throw new Error("Solana swaps go through Jupiter, not this route");
  }
  return getLifiQuote(request, fromAddress);
}

export async function executeSwap(seed: Uint8Array, quote: SwapQuote): Promise<SwapResult> {
  const support = swapSupport(quote.chain);
  if (support.provider !== "lifi") throw new Error("Unsupported swap route");
  return executeLifiSwap(seed, quote);
}
