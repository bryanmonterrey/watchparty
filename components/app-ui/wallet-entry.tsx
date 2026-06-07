"use client";

import dynamic from "next/dynamic";

// Lazy wallet button. The Solana wallet SDK (@solana/wallet-adapter + web3.js +
// @coral-xyz/anchor) used to load on every app page via AppProviders, which
// crashed mobile Safari on /home. Here it loads client-side in its own chunk,
// keeping it out of the main app bundle / initial render.
const WalletButtonScoped = dynamic(() => import("@/components/wallet/wallet-button-scoped"), {
  ssr: false,
  loading: () => (
    <div className="h-11 w-[110px] rounded-full bg-zinc-500/35 backdrop-blur-xs" aria-hidden />
  ),
});

export function WalletEntry() {
  return <WalletButtonScoped />;
}
