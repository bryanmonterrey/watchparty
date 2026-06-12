import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import { authClient } from '@/lib/auth-client';
import { getBaseUrl } from '@/lib/base-url';
import { trpc } from '@/lib/trpc';

/**
 * TanStack Query + tRPC providers for the whole app. There is no
 * web-style route-group split here — native apps don't pay a per-route
 * bundle cost, so one provider tree at the root is fine.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            // The expoClient plugin keeps the better-auth session cookie in
            // SecureStore; forward it so protectedProcedures see the session.
            const cookie = authClient.getCookie();
            return cookie ? { Cookie: cookie } : {};
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
