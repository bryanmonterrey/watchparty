'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../app-ui/use-transaction-toast'
import { toast } from 'sonner'
import { getCounterProgram, getCounterProgramId } from './counter-exports'

export function useCounterProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getCounterProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getCounterProgram(provider, programId), [provider, programId])

  const accounts = useQuery({
    queryKey: ['counter', 'all', { cluster }],
    queryFn: () => (program.account as any).counter.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const initialize = useMutation({
    mutationKey: ['counter', 'initialize', { cluster }],
    mutationFn: (keypair: Keypair) =>
      program.methods
        .initialize()
        .accounts({
          counter: keypair.publicKey,
          payer: provider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc(),
    onSuccess: (signature) => {
      transactionToast(signature)
      return accounts.refetch()
    },
    onError: () => toast.error('Failed to initialize account'),
  })

  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    initialize,
    provider,
  }
}

export function useCounterProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const { program, accounts, provider } = useCounterProgram()

  const accountQuery = useQuery({
    queryKey: ['counter', 'fetch', { cluster, account }],
    queryFn: () => (program.account as any).counter.fetch(account),
  })

  const increment = useMutation({
    mutationKey: ['counter', 'increment', { cluster, account }],
    mutationFn: () => program.methods.increment().accounts({ counter: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accountQuery.refetch()
    },
  })

  const decrement = useMutation({
    mutationKey: ['counter', 'decrement', { cluster, account }],
    mutationFn: () => program.methods.decrement().accounts({ counter: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accountQuery.refetch()
    },
  })

  const set = useMutation({
    mutationKey: ['counter', 'set', { cluster, account }],
    mutationFn: (value: number) => program.methods.set(value).accounts({ counter: account }).rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accountQuery.refetch()
    },
  })

  const close = useMutation({
    mutationKey: ['counter', 'close', { cluster, account }],
    mutationFn: () =>
      program.methods
        .close()
        .accounts({
          counter: account,
          payer: provider.publicKey,
        })
        .rpc(),
    onSuccess: (tx) => {
      transactionToast(tx)
      return accounts.refetch()
    },
  })

  return {
    accountQuery,
    increment,
    decrement,
    set,
    close,
  }
}
