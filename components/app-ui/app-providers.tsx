"use client";

import { Toaster } from "@/components/ui/sonner";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TrayProvider } from "@/components/providers/tray-provider";
import { HeartbeatProvider } from "@/components/app-ui/heartbeat-provider";

// NOTE: Solana/cluster providers are intentionally NOT global. The wallet SDK
// (@solana/wallet-adapter + web3.js + @coral-xyz/anchor) is heavy and, loaded on
// every app page, pushed mobile Safari over its memory limit on /home ("this
// page couldn't load"). It's now scoped + lazy-loaded by the wallet button
// (components/app-ui/wallet-entry). Other wallet features mount their own scope.
export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ReactQueryProvider>
        <TrayProvider>
          <HeartbeatProvider />
          {children}
          <Toaster position="bottom-center" />
        </TrayProvider>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
