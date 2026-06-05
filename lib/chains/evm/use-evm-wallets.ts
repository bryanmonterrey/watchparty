"use client";

import { useEffect, useState } from "react";

// EIP-6963: discover injected EVM wallets (MetaMask, Rainbow, Coinbase, …) that
// announce themselves, instead of fighting over a single window.ethereum.
export interface Eip6963Wallet {
  rdns: string;
  name: string;
  icon: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
}

export function useEvmWallets(): Eip6963Wallet[] {
  const [wallets, setWallets] = useState<Eip6963Wallet[]>([]);

  useEffect(() => {
    const found = new Map<string, Eip6963Wallet>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onAnnounce = (event: any) => {
      const { info, provider } = event.detail ?? {};
      if (!info?.rdns) return;
      found.set(info.rdns, { rdns: info.rdns, name: info.name, icon: info.icon, provider });
      setWallets(Array.from(found.values()));
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  }, []);

  return wallets;
}
