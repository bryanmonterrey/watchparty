// Taken from https://tanstack.com/query/5/docs/framework/react/guides/advanced-ssr
'use client'

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, trpcClient } from '@/lib/trpc/client'
import { useState } from 'react'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
        refetchOnWindowFocus: false, // Don't refetch when window regains focus

        // RETRY POLICY EXISTS BECAUSE OF THE 2026-08-08 OUTAGE.
        //
        // The default (3 retries, retry everything) turned one dead upstream
        // into a connection storm: the Helius key was exhausted, every
        // /api/rpc call 502'd, and ~52 polling queries across the app each
        // multiplied 4x. The single container instance hit Cloudflare's 4096
        // concurrent-connection ceiling and the whole site started 500-ing at
        // the proxy — from ONE user.
        //
        // Two changes, both aimed at not amplifying a failure:
        //   - never retry a 4xx. The answer will not change, and 401/403/404
        //     were being retried 3x for nothing.
        //   - one retry instead of three, with a floor of 1s and a longer cap,
        //     so a broken dependency degrades instead of compounding.
        retry: (failureCount, error) => {
          const status =
            (error as { data?: { httpStatus?: number } })?.data?.httpStatus ??
            (error as { status?: number })?.status
          if (typeof status === 'number' && status >= 400 && status < 500) return false
          return failureCount < 1
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      },
      mutations: {
        // Mutations are never safe to replay blindly — a retried buy is a
        // second buy. Failures surface to the caller instead.
        retry: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (isServer) {
    return makeQueryClient()
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  const [trpcClientInstance] = useState(() => trpcClient)

  return (
    <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
