"use client";

import { Toaster } from "@/components/ui/sonner";
import { SolanaProvider } from "@/components/solana/solana-provider";
import { ClusterProvider } from "@/components/cluster/cluster-data-access";
import { EvmProvider } from "@/lib/chains/evm/evm-provider";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TrayProvider } from "@/components/providers/tray-provider";
import { HeartbeatProvider } from "@/components/app-ui/heartbeat-provider";

// Global multi-chain provider stack. Solana (cluster + wallet-adapter) and EVM
// (lean EIP-6963/EIP-1193) sit side by side, so the whole app can use both
// chains together. EvmProvider is lightweight — the heavy WalletConnect/AppKit
// stack stays lazy in the login QR flow, never global.
export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ReactQueryProvider>
        <ClusterProvider>
          <SolanaProvider>
            <EvmProvider>
              <TrayProvider>
                <HeartbeatProvider />
                {children}
                <Toaster position="bottom-center" />
              </TrayProvider>
            </EvmProvider>
          </SolanaProvider>
        </ClusterProvider>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
