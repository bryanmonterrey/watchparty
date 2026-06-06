import type { ChainConfig } from "./types";

// Supported chains. Solana is the primary chain (ported from sidebar);
// Base + Hyperliquid are the EVM chains we're adding (SIWE).
export const SOLANA: ChainConfig = {
  id: "solana",
  kind: "solana",
  name: "Solana",
  rpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  explorer: "https://solscan.io",
  nativeCurrency: { symbol: "SOL", decimals: 9 },
};

export const ETHEREUM: ChainConfig = {
  id: "ethereum",
  kind: "evm",
  name: "Ethereum",
  chainId: 1,
  rpcUrl: "https://cloudflare-eth.com",
  explorer: "https://etherscan.io",
  nativeCurrency: { symbol: "ETH", decimals: 18 },
};

export const BASE: ChainConfig = {
  id: "base",
  kind: "evm",
  name: "Base",
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
  explorer: "https://basescan.org",
  nativeCurrency: { symbol: "ETH", decimals: 18 },
};

export const HYPERLIQUID: ChainConfig = {
  id: "hyperliquid",
  kind: "evm",
  name: "Hyperliquid",
  chainId: 999,
  rpcUrl: "https://rpc.hyperliquid.xyz/evm",
  explorer: "https://hyperevmscan.io",
  nativeCurrency: { symbol: "HYPE", decimals: 18 },
};

export const BITCOIN: ChainConfig = {
  id: "bitcoin",
  kind: "bitcoin",
  name: "Bitcoin",
  explorer: "https://mempool.space",
  nativeCurrency: { symbol: "BTC", decimals: 8 },
};

export const CHAINS: ChainConfig[] = [SOLANA, ETHEREUM, BASE, HYPERLIQUID, BITCOIN];
export const EVM_CHAINS = CHAINS.filter((c) => c.kind === "evm");

export function getChain(id: string): ChainConfig | undefined {
  return CHAINS.find((c) => c.id === id);
}
