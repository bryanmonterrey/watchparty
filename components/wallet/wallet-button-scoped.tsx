"use client";

import { ClusterProvider } from "@/components/cluster/cluster-data-access";
import { SolanaProvider } from "@/components/solana/solana-provider";
import WalletButton from "./wallet-button";

// The wallet button + its own Solana/cluster provider scope. Imported lazily
// (see wallet-entry) so the heavy wallet SDK isn't in the main app bundle.
export default function WalletButtonScoped() {
  return (
    <ClusterProvider>
      <SolanaProvider>
        <WalletButton />
      </SolanaProvider>
    </ClusterProvider>
  );
}
