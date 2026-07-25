import type { ChainId } from "../types";

/** LI.FI's sentinel for a chain's native coin. */
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

export interface SwapQuoteRequest {
  chain: ChainId;
  /** Contract address, or NATIVE_TOKEN for the native coin. */
  fromToken: string;
  toToken: string;
  /** Base units, as a string. */
  fromAmount: string;
  /** Slippage as a fraction — 0.005 = 0.5%. */
  slippage?: number;
}

export interface SwapQuote {
  chain: ChainId;
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
}
