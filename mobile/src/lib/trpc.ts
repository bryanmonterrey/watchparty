import { createTRPCReact } from '@trpc/react-query';

// Type-only import from the Next.js app one directory up (tsconfig maps @/*
// to ./src/* first, then ../*). `import type` is erased at compile time, so
// Metro never bundles server code — NEVER turn this into a value import.
import type { AppRouter } from '@/server/routers';

/**
 * tRPC React hooks, fully typed against the web app's appRouter.
 */
export const trpc = createTRPCReact<AppRouter>();
