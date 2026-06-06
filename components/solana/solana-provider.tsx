'use client'

import { WalletError } from '@solana/wallet-adapter-base'
import {
  AnchorWallet,
  ConnectionProvider,
  useConnection,
  useWallet,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { ReactNode, useCallback, useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import '@solana/wallet-adapter-react-ui/styles.css'
import { AnchorProvider } from '@coral-xyz/anchor'

export { default as WalletButton } from '../wallet/wallet-button';

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
  // UniversalProvider (lib/chains/wallet-connect.ts) — registering the
  // solana-adapter here spun up a SECOND WalletConnect core (the "Init() called
  // 2 times" warning) that conflicts with QR sessions.
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} onError={onError} autoConnect={true}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export function useAnchorProvider() {
  const { connection } = useConnection()
  const wallet = useWallet()

  return new AnchorProvider(connection, wallet as AnchorWallet, { commitment: 'confirmed' })
}
