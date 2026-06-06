"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, base } from "wagmi/chains";
import { coinbaseWallet, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// wagmi auto-discovers every injected wallet via EIP-6963 (MetaMask, Phantom,
// Rainbow, …) and exposes them as connectors — no hand-rolled detection. We add
// Coinbase (Base smart wallet) + WalletConnect (QR) on top.
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    coinbaseWallet({ appName: process.env.NEXT_PUBLIC_APP_NAME || "Watchparty" }),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
  ssr: false,
});

const queryClient = new QueryClient();

export function EvmProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
