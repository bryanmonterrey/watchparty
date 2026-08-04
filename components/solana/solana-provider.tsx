'use client'

import { WalletAdapterNetwork, WalletError, type Adapter } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import dynamic from 'next/dynamic'
import { ReactNode, useCallback, useMemo, useState } from 'react'
import { ClusterNetwork, useCluster } from '../cluster/cluster-data-access'

// ssr:false is mandatory here, not a preference. This provider wraps the WHOLE
// authenticated app (see app-providers.tsx), so a static
// `@walletconnect/solana-adapter` import put @reown/appkit-ui +
// @phosphor-icons/webcomponents — 355 KiB gzipped, the single largest package
// in the Worker — into the server bundle on every route. See the registrar for
// the full explanation of why lazy-importing alone does not remove it.
const WalletConnectRegistrar = dynamic(() => import('./walletconnect-registrar'), { ssr: false })

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

  // Starts empty and gains WalletConnect once the client-only registrar mounts.
  // Wallet Standard wallets (Phantom, Solflare, Backpack…) are unaffected —
  // they self-register with the adapter library and were never in this array.
  // The only visible consequence is that the WalletConnect entry appears a tick
  // after a browser-extension wallet would; autoConnect still restores a
  // previously-selected WalletConnect session when the adapter arrives.
  const [wallets, setWallets] = useState<Adapter[]>([])
  const handleWalletConnectReady = useCallback((adapter: Adapter) => {
    setWallets((current) => (current.some((w) => w.name === adapter.name) ? current : [...current, adapter]))
  }, [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletConnectRegistrar network={network} onReady={handleWalletConnectReady} />
      <WalletProvider wallets={wallets} onError={onError} autoConnect={true}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
