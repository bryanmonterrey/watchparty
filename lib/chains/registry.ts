import type { ChainConfig, ChainId, ChainKind } from "./types";

// Supported networks — mirrors Phantom's multichain account set, minus Monad.
// Every chain here is derivable from the single account mnemonic; the five EVM
// chains share one secp256k1 address (kind "evm"), so switching between them
// changes the RPC and the balances, never the address.

export const SOLANA: ChainConfig = {
  id: "solana",
  kind: "solana",
  name: "Solana",
  coinType: 501,
  derivationPath: "m/44'/501'/0'/0'",
  rpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  explorer: "https://solscan.io",
  nativeCurrency: { symbol: "SOL", decimals: 9 },
};

export const ETHEREUM: ChainConfig = {
  id: "ethereum",
  kind: "evm",
  name: "Ethereum",
  chainId: 1,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0",
  // cloudflare-eth.com is dead (returns -32603 Internal error) — publicnode is
  // keyless and healthy. Verified 2026-07-25.
  rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
  explorer: "https://etherscan.io",
  nativeCurrency: { symbol: "ETH", decimals: 18 },
};

export const BITCOIN: ChainConfig = {
  id: "bitcoin",
  kind: "bitcoin",
  name: "Bitcoin",
  coinType: 0,
  // BIP-84 native segwit (bc1q…) — what Phantom issues for a fresh account.
  derivationPath: "m/84'/0'/0'/0/0",
  rpcUrl: process.env.NEXT_PUBLIC_BITCOIN_API_URL ?? "https://mempool.space/api",
  explorer: "https://mempool.space",
  nativeCurrency: { symbol: "BTC", decimals: 8 },
};

export const BASE: ChainConfig = {
  id: "base",
  kind: "evm",
  name: "Base",
  chainId: 8453,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0",
  rpcUrl: process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org",
  explorer: "https://basescan.org",
  nativeCurrency: { symbol: "ETH", decimals: 18 },
};

export const SUI: ChainConfig = {
  id: "sui",
  kind: "sui",
  name: "Sui",
  coinType: 784,
  derivationPath: "m/44'/784'/0'/0'/0'",
  rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC_URL ?? "https://fullnode.mainnet.sui.io:443",
  explorer: "https://suiscan.xyz/mainnet",
  nativeCurrency: { symbol: "SUI", decimals: 9 },
};

export const POLYGON: ChainConfig = {
  id: "polygon",
  kind: "evm",
  name: "Polygon",
  chainId: 137,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0",
  // polygon-rpc.com now 403s ("API key disabled"). Verified 2026-07-25.
  rpcUrl: process.env.NEXT_PUBLIC_POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com",
  explorer: "https://polygonscan.com",
  nativeCurrency: { symbol: "POL", decimals: 18 },
};

export const BNB: ChainConfig = {
  id: "bnb",
  kind: "evm",
  name: "BNB Chain",
  chainId: 56,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0",
  rpcUrl: process.env.NEXT_PUBLIC_BNB_RPC_URL ?? "https://bsc-rpc.publicnode.com",
  explorer: "https://bscscan.com",
  nativeCurrency: { symbol: "BNB", decimals: 18 },
};

export const HYPEREVM: ChainConfig = {
  id: "hyperevm",
  kind: "evm",
  name: "HyperEVM",
  chainId: 999,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0",
  rpcUrl: process.env.NEXT_PUBLIC_HYPEREVM_RPC_URL ?? "https://rpc.hyperliquid.xyz/evm",
  explorer: "https://hyperevmscan.io",
  nativeCurrency: { symbol: "HYPE", decimals: 18 },
};

export const ROBINHOOD: ChainConfig = {
  id: "robinhood",
  kind: "evm",
  name: "Robinhood Chain",
  chainId: 4663,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0",
  // Robinhood's public RPC is rate-limited; set the env var to a dedicated
  // provider before this sees real traffic.
  rpcUrl: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://explorer.chain.robinhood.com",
  nativeCurrency: { symbol: "ETH", decimals: 18 },
};

/** Display order matches the network switcher, top to bottom. */
export const CHAINS: ChainConfig[] = [
  SOLANA,
  ETHEREUM,
  BITCOIN,
  BASE,
  SUI,
  POLYGON,
  BNB,
  HYPEREVM,
  ROBINHOOD,
];

export const EVM_CHAINS = CHAINS.filter((c) => c.kind === "evm");

export const DEFAULT_CHAIN: ChainConfig = SOLANA;

export function getChain(id: string): ChainConfig | undefined {
  return CHAINS.find((c) => c.id === id);
}

export function getChainOrDefault(id: string | undefined): ChainConfig {
  return (id && getChain(id)) || DEFAULT_CHAIN;
}

export function getChainByEvmId(chainId: number): ChainConfig | undefined {
  return EVM_CHAINS.find((c) => c.chainId === chainId);
}

/** Every chain sharing an address kind — e.g. all five EVM chains. */
export function chainsOfKind(kind: ChainKind): ChainConfig[] {
  return CHAINS.filter((c) => c.kind === kind);
}

/** The distinct address kinds, in switcher order. One derived address each. */
export const CHAIN_KINDS: ChainKind[] = ["solana", "evm", "bitcoin", "sui"];

/** Canonical derivation path per address kind. */
export const KIND_PATHS: Record<ChainKind, string> = {
  solana: SOLANA.derivationPath,
  evm: ETHEREUM.derivationPath,
  bitcoin: BITCOIN.derivationPath,
  sui: SUI.derivationPath,
};

export function isChainId(value: string): value is ChainId {
  return CHAINS.some((c) => c.id === value);
}
