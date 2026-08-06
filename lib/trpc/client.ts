"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchStreamLink } from "@trpc/client";
import type { AppRouter } from "@/server/routers";
import superjson from "superjson";

/**
 * tRPC React hooks
 * Use this to call tRPC procedures from client components
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Get the base URL for tRPC requests
 */
function getBaseUrl() {
    if (typeof window !== "undefined") {
        // Browser should use relative path
        return "";
    }

    // SSR should use absolute URL
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    return `http://localhost:${process.env.PORT ?? 3001}`;
}

/**
 * Create tRPC client
 */
export const trpcClient = trpc.createClient({
    links: [
        // Streaming batch link: still bundles concurrent calls into one request,
        // but flushes each procedure's result as it resolves instead of waiting
        // for the slowest one (no head-of-line blocking). Same TanStack Query
        // cache behaviour — this only changes the HTTP transport.
        httpBatchStreamLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            // Cap how much rides in one request.
            //
            // A batch runs every procedure in it inside ONE worker invocation,
            // in one isolate, at the same time — so a page that fires twenty
            // queries at mount asks a 128 MB budget to hold twenty result sets
            // at once. Workers were being killed for `exceededMemory` (26 in an
            // hour) on exactly that shape, including a getPollsForPosts batch
            // carrying a screenful of post ids.
            //
            // Splitting past this length costs an extra HTTP request and buys
            // headroom the isolate can't otherwise get: the memory ceiling is
            // fixed and not configurable.
            maxURLLength: 2000,
            headers() {
                return {};
            },
        }),
    ],
});
