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

    // Some wallets inject late or don't implement EIP-6963 — re-request, and fall
    // back to the legacy window.ethereum provider if nothing announced.
    const t = setTimeout(() => {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eth = (window as any).ethereum;
      if (found.size === 0 && eth) {
        found.set("injected", {
          rdns: "injected",
          name: eth.isMetaMask ? "MetaMask" : "Browser Wallet",
          icon: "",
          provider: eth,
        });
        setWallets(Array.from(found.values()));
      }
    }, 700);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      clearTimeout(t);
    };
  }, []);

  return wallets;
}
