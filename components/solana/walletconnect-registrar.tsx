"use client";

import { useEffect } from "react";
import { WalletAdapterNetwork, type Adapter } from "@solana/wallet-adapter-base";
import { WalletConnectWalletAdapter } from "@walletconnect/solana-adapter";

// This file exists to keep `@walletconnect/solana-adapter` out of the SERVER
// bundle, and it only works because its single consumer loads it with
// `dynamic(..., { ssr: false })`. Do not import it directly.
//
// Why: the adapter pulls @reown/appkit → @reown/appkit-ui →
// @phosphor-icons/webcomponents + lit, which measured 355 KiB GZIPPED inside
// the Cloudflare Worker — the largest single package in it, bigger than `next`
// itself. Nothing in this app renders AppKit's UI (CLAUDE.md notes AppKit
// "is not imported by source"; it arrives transitively through this adapter),
// so every one of those bytes was dead weight in a script that Cloudflare caps
// at 10 MiB compressed.
//
// Making the import lazy is NOT sufficient on its own. Turbopack bundles a
// dynamic import's target whether or not the code path can be reached, so
// `await import()` inside an effect still emits an SSR chunk. `ssr: false` at
// the use site is the only thing that removes a module from the server graph.
//
// Registering through a callback (rather than building the adapter inside
// SolanaProvider) is what lets the rest of the app keep server-rendering: only
// this leaf leaves the server graph, not the provider subtree holding the app.
export default function WalletConnectRegistrar({
  network,
  onReady,
}: {
  // Narrower than WalletAdapterNetwork on purpose: the WalletConnect adapter's
  // options reject Testnet, so accepting the full enum here would only defer
  // that error to the constructor.
  network: WalletAdapterNetwork.Mainnet | WalletAdapterNetwork.Devnet;
  onReady: (adapter: Adapter) => void;
}) {
  useEffect(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL || "https://watchparty.xyz";

    const adapter = new WalletConnectWalletAdapter({
      network,
      options: {
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
        metadata: {
          name: process.env.NEXT_PUBLIC_APP_NAME || "Watchparty",
          description: "Sign in to Watchparty",
          url: origin,
          icons: [`${origin}/icon-192.png`],
        },
      },
    });

    onReady(adapter as unknown as Adapter);
  }, [network, onReady]);

  return null;
}
