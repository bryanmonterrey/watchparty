import { createTRPCReact } from "@trpc/react-query";
// Type-only across the app boundary (the mobile/ rule): the main repo's
// router graph is erased at build time, so none of its server code lands in
// this bundle — but every procedure stays fully typed.
import type { AppRouter } from "@/server/routers";

export const trpc = createTRPCReact<AppRouter>();
