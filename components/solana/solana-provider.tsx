'use client'

import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base'
import {
  AnchorWallet,
  ConnectionProvider,
  useConnection,
  useWallet,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletConnectWalletAdapter } from "@walletconnect/solana-adapter";
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import dynamic from 'next/dynamic'
import { ReactNode, useCallback, useMemo, useState, useEffect } from 'react'
import { ClusterNetwork, useCluster } from '../cluster/cluster-data-access'
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
  const network = useMemo(() => {
    switch (cluster.network) {
      case ClusterNetwork.Mainnet:
        return WalletAdapterNetwork.Mainnet;
      default:
        return WalletAdapterNetwork.Devnet;
    }
  }, [cluster.network])
  const onError = useCallback((error: WalletError) => {
    console.error(error)
  }, [])

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      console.log("WalletConnect Config:", {
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
        metadataUrl: window.location.origin
      });
    }
  }, []);

  const wallets = useMemo(() => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_BASE_URL || 'https://watchparty.xyz');

    return [
      new WalletConnectWalletAdapter({
        network,
        options: {
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '8d7de790d4225d0bfd02ad68ad524d1f',
          metadata: {
            name: process.env.NEXT_PUBLIC_APP_NAME || 'watchparty',
            description: 'Connect wallet',
            url: currentOrigin,
            icons: ['https://watchparty.xyz/favicon.ico']
          }
        },
      }),
    ];
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} onError={onError} autoConnect={true}>
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
