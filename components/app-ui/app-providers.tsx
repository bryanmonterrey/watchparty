"use client";

import { Toaster } from "@/components/ui/sonner";
import { SolanaProvider } from "@/components/solana/solana-provider";
import { ClusterProvider } from "@/components/cluster/cluster-data-access";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TrayProvider } from "@/components/providers/tray-provider";
import { HeartbeatProvider } from "@/components/app-ui/heartbeat-provider";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ReactQueryProvider>
        <ClusterProvider>
          <SolanaProvider>
            <TrayProvider>
              <HeartbeatProvider />
              {children}
              <Toaster position="bottom-center" />
            </TrayProvider>
          </SolanaProvider>
        </ClusterProvider>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
