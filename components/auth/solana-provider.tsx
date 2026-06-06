"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SOLANA } from "@/lib/chains/registry";

// Scoped Solana provider — only wraps the Connect Wallet flow (lazy-loaded),
// NOT the whole app. Wallet Standard wallets (Phantom, Solflare, Backpack…)
// auto-register with WalletProvider, so no explicit adapters are needed.
//
// We deliberately do NOT register @walletconnect/solana-adapter here: QR sign-in
// goes through our shared UniversalProvider (lib/chains/wallet-connect.ts).
// Registering the adapter spins up a SECOND WalletConnect core against the same
// projectId, which conflicts with the QR session and makes wallets reject the scan.
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = SOLANA.rpcUrl ?? "https://api.mainnet-beta.solana.com";

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
