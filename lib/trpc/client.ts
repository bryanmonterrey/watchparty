"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
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
        httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            headers() {
                return {};
            },
        }),
    ],
});
