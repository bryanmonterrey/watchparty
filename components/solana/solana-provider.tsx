'use client'

import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletConnectWalletAdapter } from '@walletconnect/solana-adapter'
import { ReactNode, useCallback, useMemo } from 'react'
import { ClusterNetwork, useCluster } from '../cluster/cluster-data-access'

// Global Solana provider. Faithful to sidebar: registers the WalletConnect
// wallet-adapter so "Sign in with QR code" works app-wide via WalletConnect's
// OWN modal, with autoConnect (select a wallet → it connects → sign). Kept lean
// otherwise — no @solana/wallet-adapter-react-ui (nothing uses useWalletModal)
// and no @coral-xyz/anchor (moved to ./use-anchor-provider) so /home doesn't
// bundle them. There is no second WalletConnect Core anymore (the custom AppKit/
// UniversalProvider layer was removed), so this adapter owns WC cleanly.
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

  const network = useMemo(
    () =>
      cluster.network === ClusterNetwork.Mainnet
        ? WalletAdapterNetwork.Mainnet
        : WalletAdapterNetwork.Devnet,
    [cluster.network],
  )

  const onError = useCallback((error: WalletError) => {
    console.error(error)
  }, [])

  const wallets = useMemo(() => {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL || 'https://watchparty.xyz'
    return [
      new WalletConnectWalletAdapter({
        network,
        options: {
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
          metadata: {
            name: process.env.NEXT_PUBLIC_APP_NAME || 'Watchparty',
            description: 'Sign in to Watchparty',
            url: origin,
            icons: [`${origin}/icon-192.png`],
          },
        },
      }),
    ]
  }, [network])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect={true}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
