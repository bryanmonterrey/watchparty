"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletConnectWalletAdapter } from "@walletconnect/solana-adapter";
import { SOLANA } from "@/lib/chains/registry";

// Scoped Solana provider — only wraps the Connect Wallet modal (lazy-loaded),
// NOT the whole app. Wallet Standard wallets (Phantom, Solflare, Backpack…)
// auto-register, so we only need to register the WalletConnect (QR) adapter.
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = SOLANA.rpcUrl ?? "https://api.mainnet-beta.solana.com";

  const wallets = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL ?? "https://watchparty.xyz";
    return [
      new WalletConnectWalletAdapter({
        network: WalletAdapterNetwork.Mainnet,
        options: {
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
          metadata: {
            name: process.env.NEXT_PUBLIC_APP_NAME || "Watchparty",
            description: "Sign in to Watchparty",
            url: origin,
            icons: [`${origin}/favicon.ico`],
          },
        },
      }),
    ];
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
