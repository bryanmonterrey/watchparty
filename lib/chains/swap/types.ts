import type { ChainId } from "../types";

/** LI.FI's sentinel for a chain's native coin. */
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

export interface SwapQuoteRequest {
  /** SOURCE chain — the one holding the token being spent, and the only one
   *  that gets signed on. */
  chain: ChainId;
  /**
   * DESTINATION chain. Omit for a same-chain swap.
   *
   * LI.FI is a bridge aggregator, not just a DEX aggregator: quoting with a
   * different `toChain` returns a route through a bridge (Relay, Mayan, …) as
   * ONE transaction on the source chain. Measured 2026-08-16, all keyless:
   * Base ETH -> BNB via Relay, Solana SOL -> BNB via Relay, Base ETH -> Solana
   * SOL via Mayan Swift, every one quoting a ~3s execution.
   */
  toChain?: ChainId;
  /** Contract address, or NATIVE_TOKEN for the native coin. */
  fromToken: string;
  toToken: string;
  /** Base units, as a string. */
  fromAmount: string;
  /** Slippage as a fraction — 0.005 = 0.5%. */
  slippage?: number;
}

export interface SwapQuote {
  /** Source chain — where the transaction is signed and broadcast. */
  chain: ChainId;
  /** Destination chain. Equal to `chain` for a same-chain swap. */
  toChain: ChainId;
  fromToken: { address: string; symbol: string; decimals: number };
  toToken: { address: string; symbol: string; decimals: number };
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  /** Aggregator/DEX that will route this. */
  tool: string;
  estimatedGas?: string;
  /** Contract needing an ERC-20 allowance before the swap can run. */
  approvalAddress?: string;
  /** Raw transaction to broadcast. Opaque — pass back to executeSwap. */
  transactionRequest?: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
}

export interface SwapResult {
  txId: string;
  explorerUrl?: string;
  /**
   * True when the destination differs from the source, i.e. the funds are
   * bridging and the source receipt does NOT mean delivery. Callers must not
   * report "done" on the strength of the source hash alone — the tx landing is
   * the START of a bridge, not the end of it.
   */
  crossChain?: boolean;
}
