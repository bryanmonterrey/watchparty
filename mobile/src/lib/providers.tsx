import { useState, type ReactNode } from 'react';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
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
  const [queryClient] = useState(
    () =>
      new QueryClient(
        // Dev: log failures with their real message — LogBox otherwise
        // surfaces blank ERROR entries that are impossible to act on.
        __DEV__
          ? {
              queryCache: new QueryCache({
                onError: (err, query) =>
                  console.error(`[query] ${query.queryHash} failed: ${err.message}`),
              }),
              mutationCache: new MutationCache({
                onError: (err) => console.error(`[mutation] failed: ${err.message}`),
              }),
            }
          : {},
      ),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            // The expoClient plugin keeps the better-auth session cookie in
            // SecureStore; forward it so protectedProcedures see the session.
            //
            // `getCookie()` returns a PROMISE as of @better-auth/expo 1.7 (the
            // secure-storage migration). Without the await this sends the string
            // "[object Promise]" as the Cookie header, which is not an error —
            // just an unauthenticated request, so every protectedProcedure would
            // start 401ing with nothing in the logs to explain it.
            const cookie = await authClient.getCookie();
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
