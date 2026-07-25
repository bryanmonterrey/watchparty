// Unified chain abstraction so wallet UI is chain-agnostic.
// Solana signs in via SIWS (better-auth-siws); EVM chains via SIWE (better-auth native).

/**
 * How a chain's keys are derived and encoded. This is the unit an *address*
 * belongs to — not the chain. All five EVM chains (Ethereum, Base, Polygon,
 * HyperEVM, Robinhood) share ONE secp256k1 address, so they share one kind.
 */
export type ChainKind = "solana" | "evm" | "bitcoin" | "sui";

/** Stable ids for every supported network. Monad is deliberately absent. */
export type ChainId =
  | "solana"
  | "ethereum"
  | "bitcoin"
  | "base"
  | "sui"
  | "polygon"
  | "hyperevm"
  | "robinhood";

export interface ChainConfig {
  id: ChainId;
  kind: ChainKind;
  name: string;
  /** EVM numeric chain id (1 Ethereum, 8453 Base, 137 Polygon, 999 HyperEVM, 4663 Robinhood). */
  chainId?: number;
  /** SLIP-44 coin type. Drives the BIP-44 derivation path — see lib/chains/derive.ts. */
  coinType: number;
  /** Full derivation path for this chain's kind, from the account mnemonic. */
  derivationPath: string;
  rpcUrl?: string;
  explorer?: string;
  nativeCurrency: { symbol: string; decimals: number };
}

export interface ConnectedWallet {
  address: string;
  chain: ChainConfig;
}

/** One derived address, shared by every chain of the same kind. */
export interface DerivedAddress {
  kind: ChainKind;
  address: string;
  derivationPath: string;
}
