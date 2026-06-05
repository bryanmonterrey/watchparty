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
