import type { ChainId } from "../types";

export interface SendRequest {
  chain: ChainId;
  /** Destination address, already validated for the chain. */
  to: string;
  /**
   * Amount in BASE UNITS as a string (wei, satoshi, lamports, MIST).
   * Never a float — 18-decimal values and satoshi counts do not survive
   * JS number precision, and a rounding error here moves the wrong amount.
   */
  amount: string;
  /** Token contract / coin type. Omit for the chain's native coin. */
  contract?: string;
}

export interface SendResult {
  /** Transaction hash / signature / digest, whatever the chain calls it. */
  txId: string;
  explorerUrl?: string;
}

export interface FeeEstimate {
  /** Fee in base units. */
  fee: string;
  /** Human-readable amount of the native coin. */
  feeFormatted: number;
  symbol: string;
}
