'use client'

import { WalletError } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { ReactNode, useCallback, useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'

// Global Solana provider. Deliberately LEAN — it loads on every authenticated
// page, so it pulls in nothing heavy:
//   - No @solana/wallet-adapter-react-ui (WalletModalProvider/styles): we use a
//     custom wallet UI (login wallet-step + WalletDrawer), nothing calls
//     useWalletModal, so that whole package was dead weight in the bundle.
//   - No @coral-xyz/anchor: useAnchorProvider moved to ./use-anchor-provider so
//     Anchor isn't dragged onto /home (it was killing mobile Safari on load).
export function SolanaProvider({ children }: { children: ReactNode }) {
  const { cluster } = useCluster()
  const endpoint = useMemo(() => {
    if (cluster.endpoint.startsWith('/')) {
      if (typeof window !== 'undefined') {
        return `${window.location.origin}${cluster.endpoint}`
      }
      return `http://localhost:3001${cluster.endpoint}`
    }
    return cluster.endpoint
  }, [cluster])
  const onError = useCallback((error: WalletError) => {
    console.error(error)
  }, [])

  // Wallet Standard wallets (Phantom, Solflare, Backpack…) auto-register, so no
  // explicit adapters are needed. WalletConnect/QR goes through our shared
  // UniversalProvider (lib/chains/wallet-connect.ts).
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} onError={onError} autoConnect={true}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
