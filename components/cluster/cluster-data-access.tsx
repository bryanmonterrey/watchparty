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

// The browser NEVER holds our RPC key.
//
// Mainnet goes through `/api/rpc`, the same-origin proxy that attaches the key
// server-side and caches read methods. It used to point at
// NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL, which meant the key shipped inside the
// client bundle — readable, and spendable, by anyone who opened devtools. That
// is also why traffic we never sent could burn the quota.
//
// Absolute, not "/api/rpc": web3.js parses the endpoint with `new URL()`, which
// rejects a relative path. NEXT_PUBLIC_BASE_URL is a domain, not a secret.
const RPC_PROXY = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/rpc`

export const defaultClusters: SolanaCluster[] = [
  {
    name: 'devnet',
    // Public devnet: nothing here is hot enough to justify a key in the bundle.
    endpoint: clusterApiUrl('devnet'),
    network: ClusterNetwork.Devnet,
  },
  {
    name: 'testnet',
    endpoint: clusterApiUrl('testnet'),
    network: ClusterNetwork.Testnet,
  },
  {
    name: 'mainnet-beta',
    endpoint: RPC_PROXY,
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
    const mainnetEndpoint = RPC_PROXY
    const devnetEndpoint = clusterApiUrl('devnet')
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
