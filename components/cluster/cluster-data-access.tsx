'use client'

import { clusterApiUrl, Connection } from '@solana/web3.js'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { createContext, ReactNode, useContext } from 'react'

export interface SolanaCluster {
  name: string
  endpoint: string
  network?: ClusterNetwork
  active?: boolean
}

export enum ClusterNetwork {
  Mainnet = 'mainnet-beta',
  Testnet = 'testnet',
  Devnet = 'devnet',
  Custom = 'custom',
}

// Mainnet uses NEXT_PUBLIC_HELIUS_RPC_URL (exposed client-side Helius endpoint) with /api/rpc proxy as fallback
export const defaultClusters: SolanaCluster[] = [
  {
    name: 'devnet',
    endpoint: process.env.NEXT_PUBLIC_HELIUS_DEVNET_RPC_URL || clusterApiUrl('devnet'),
    network: ClusterNetwork.Devnet,
  },
  {
    name: 'testnet',
    endpoint: clusterApiUrl('testnet'),
    network: ClusterNetwork.Testnet,
  },
  {
    name: 'mainnet-beta',
    endpoint: process.env.NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL || '/api/rpc',
    network: ClusterNetwork.Mainnet,
  },
]

const clusterAtom = atomWithStorage<SolanaCluster>('solana-cluster', defaultClusters[2]) // Default to mainnet
const clustersAtom = atomWithStorage<SolanaCluster[]>('solana-clusters', defaultClusters, undefined, {
  getOnInit: true,
})

// Always sync the mainnet endpoint from env var so stale localStorage values don't block connections
const syncedClustersAtom = atom(
  (get) => {
    const clusters = get(clustersAtom)
    const mainnetEndpoint = process.env.NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL || '/api/rpc'
    const devnetEndpoint = process.env.NEXT_PUBLIC_HELIUS_DEVNET_RPC_URL || clusterApiUrl('devnet')
    return clusters.map((c) => {
      if (c.network === ClusterNetwork.Mainnet) return { ...c, endpoint: mainnetEndpoint }
      if (c.network === ClusterNetwork.Devnet) return { ...c, endpoint: devnetEndpoint }
      return c
    })
  },
  (_get, set, newClusters: SolanaCluster[]) => set(clustersAtom, newClusters)
)

const activeClustersAtom = atom<SolanaCluster[]>((get) => {
  const clusters = get(syncedClustersAtom)
  const cluster = get(clusterAtom)
  return clusters.map((item) => ({
    ...item,
    active: item.name === cluster.name,
  }))
})

const activeClusterAtom = atom<SolanaCluster>((get) => {
  const clusters = get(activeClustersAtom)

  return clusters.find((item) => item.active) || clusters[0]
})

export interface ClusterProviderContext {
  cluster: SolanaCluster
  clusters: SolanaCluster[]
  addCluster: (cluster: SolanaCluster) => void
  deleteCluster: (cluster: SolanaCluster) => void
  setCluster: (cluster: SolanaCluster) => void

  getExplorerUrl(path: string): string
}

const Context = createContext<ClusterProviderContext>({} as ClusterProviderContext)

export function ClusterProvider({ children }: { children: ReactNode }) {
  const cluster = useAtomValue(activeClusterAtom)
  const clusters = useAtomValue(activeClustersAtom)
  const setCluster = useSetAtom(clusterAtom)
  const setClusters = useSetAtom(syncedClustersAtom)

  const value: ClusterProviderContext = {
    cluster,
    clusters: clusters.sort((a, b) => (a.name > b.name ? 1 : -1)),
    addCluster: (cluster: SolanaCluster) => {
      try {
        new Connection(cluster.endpoint)
        setClusters([...clusters, cluster])
      } catch (err) {
        console.error(`${err}`)
      }
    },
    deleteCluster: (cluster: SolanaCluster) => {
      setClusters(clusters.filter((item) => item.name !== cluster.name))
    },
    setCluster: (cluster: SolanaCluster) => setCluster(cluster),
    getExplorerUrl: (path: string) => `https://orbmarkets.io/${path}`,
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCluster() {
  return useContext(Context)
}

function getClusterUrlParam(cluster: SolanaCluster): string {
  let suffix = ''
  switch (cluster.network) {
    case ClusterNetwork.Devnet:
      suffix = 'devnet'
      break
    case ClusterNetwork.Mainnet:
      suffix = ''
      break
    case ClusterNetwork.Testnet:
      suffix = 'testnet'
      break
  }

  return suffix.length ? `?cluster=${suffix}` : ''
}
