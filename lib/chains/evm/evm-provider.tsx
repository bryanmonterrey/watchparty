"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useEvmWallets, type Eip6963Wallet } from "./use-evm-wallets";

// EVM wallet context — the EVM counterpart to Solana's useWallet(), modeled the
// same way but LEAN: just EIP-6963 discovery + EIP-1193 requests (no wagmi, no
// AppKit). The heavy WalletConnect/AppKit stack stays lazy (login QR only).
// Exposes connection state so the whole app can use Solana and EVM together.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Eip1193Provider = any;

interface EvmContextValue {
  /** Injected EVM wallets discovered via EIP-6963 (MetaMask, Rainbow, …). */
  wallets: Eip6963Wallet[];
  /** Connected account, or null. */
  address: string | null;
  /** Connected chain id (decimal), or null. */
  chainId: number | null;
  connected: boolean;
  connecting: boolean;
  /** The connected EIP-1193 provider (for signing), or null. */
  provider: Eip1193Provider | null;
  connect: (wallet: Eip6963Wallet) => Promise<void>;
  disconnect: () => void;
}

const EvmContext = createContext<EvmContextValue | null>(null);

export function EvmProvider({ children }: { children: React.ReactNode }) {
  const wallets = useEvmWallets();
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async (wallet: Eip6963Wallet) => {
    setConnecting(true);
    try {
      const accounts: string[] = await wallet.provider.request({ method: "eth_requestAccounts" });
      const cid: string = await wallet.provider.request({ method: "eth_chainId" });
      setProvider(wallet.provider);
      setAddress(accounts[0] ?? null);
      setChainId(Number.parseInt(cid, 16));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setAddress(null);
    setChainId(null);
  }, []);

  // Keep state in sync if the user switches accounts/networks in their wallet.
  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (accs: string[]) => setAddress(accs[0] ?? null);
    const onChain = (cid: string) => setChainId(Number.parseInt(cid, 16));
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  return (
    <EvmContext.Provider
      value={{ wallets, address, chainId, connected: !!address, connecting, provider, connect, disconnect }}
    >
      {children}
    </EvmContext.Provider>
  );
}

export function useEvm(): EvmContextValue {
  const ctx = useContext(EvmContext);
  if (!ctx) throw new Error("useEvm must be used within an EvmProvider");
  return ctx;
}
