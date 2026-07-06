'use client'

import { useConnection } from '@solana/wallet-adapter-react'

import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { ReactNode } from 'react'

import { useCluster } from './cluster-data-access'
import { GooDropdown } from '@/components/ui/goo-dropdown'
import { Button, buttonVariants } from '@/components/ui/button'
import { AppAlert } from '@/components/app-ui/app-alert'

export function ExplorerLink({ path, label, className }: { path: string; label: string; className?: string }) {
  const { getExplorerUrl } = useCluster()
  return (
    <a
      href={getExplorerUrl(path)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? className : `link `}
    >
      {label}
    </a>
  )
}

export function ClusterChecker({ children }: { children: ReactNode }) {
  const { cluster } = useCluster()
  const { connection } = useConnection()

  const query = useQuery({
    queryKey: ['version', { cluster, endpoint: connection.rpcEndpoint }],
    queryFn: () => connection.getVersion(),
    retry: 1,
  })
  return (
    <>
      {(query.isError || (!query.isLoading && !query.data)) && (
        <AppAlert
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              Refresh
            </Button>
          }
        >
          Error connecting to cluster <span className="font-bold">{cluster.name}</span>.
        </AppAlert>
      )}
      {children}
    </>
  )
}

export function ClusterUiSelect() {
  const { clusters, setCluster, cluster } = useCluster()
  return (
    <GooDropdown
      align="end"
      width={200}
      trigger={cluster.name}
      triggerClassName={buttonVariants({ variant: 'outline' })}
      items={clusters.map((item) => ({
        key: item.name,
        label: item.name,
        onClick: () => setCluster(item),
      }))}
    />
  )
}
