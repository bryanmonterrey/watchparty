'use client'

import { AnchorProvider } from '@coral-xyz/anchor'
import { AnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'

// Anchor provider for on-chain program calls. Kept OUT of solana-provider.tsx on
// purpose: that file is the GLOBAL app provider, so anything it imports lands in
// every authenticated page's bundle. @coral-xyz/anchor is heavy and only needed
// where we actually talk to a program — import this there, not the provider.
export function useAnchorProvider() {
  const { connection } = useConnection()
  const wallet = useWallet()

  return new AnchorProvider(connection, wallet as AnchorWallet, { commitment: 'confirmed' })
}
