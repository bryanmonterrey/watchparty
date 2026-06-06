// Unified chain abstraction so wallet UI is chain-agnostic.
// Solana signs in via SIWS (better-auth-siws); EVM chains via SIWE (better-auth native).

export type ChainKind = "solana" | "evm";

export interface ChainConfig {
  /** Stable id: "solana" | "base" | "hyperliquid". */
  id: string;
  kind: ChainKind;
  name: string;
  /** EVM numeric chain id (8453 Base, 999 Hyperliquid). Undefined for Solana. */
  chainId?: number;
  rpcUrl?: string;
  explorer?: string;
  nativeCurrency?: { symbol: string; decimals: number };
}

export interface ConnectedWallet {
  address: string;
  chain: ChainConfig;
}
