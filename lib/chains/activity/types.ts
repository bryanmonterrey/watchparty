import type { ChainConfig, ChainId, ChainKind } from "../types";

/** One historical transaction, normalized across ecosystems. */
export interface ChainActivity {
  chain: ChainId;
  /** Tx hash / signature / digest — whatever the chain calls its id. */
  txId: string;
  /** Unix seconds. */
  timestamp: number;
  status: "success" | "failed";
  /** Net direction for the queried address. */
  isOutgoing: boolean;
  /** Human-readable amount moved (may be 0 for contract calls). */
  amount: number;
  symbol: string;
  /** Contract / mint / coin type; null for the native coin. */
  contract: string | null;
  counterparty?: string;
  /** Network fee in the native coin, when the chain reports it. */
  fee?: number;
  type: string;
  explorerUrl?: string;
}

export interface ActivityProvider {
  kind: ChainKind;
  getActivity(address: string, chain: ChainConfig, limit: number): Promise<ChainActivity[]>;
}
