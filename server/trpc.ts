import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import superjson from "superjson";

/**
 * Create context for tRPC requests
 * This runs on every request and provides the session to all procedures
 */
export async function createContext() {
    // Read once and reuse: `headers()` is per-request, and getSession needs it
    // anyway, so putting it on the context costs nothing and saves procedures
    // reaching for `next/headers` on their own.
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    return {
        session,
        user: session?.user ?? null,
        /**
         * The request headers. Procedures that need the CALLER rather than the
         * account use this — rate limits and per-viewer dedupe on public
         * endpoints, where there may be no user at all.
         */
        headers: h,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

/**
 * Initialize tRPC with context
 */
const t = initTRPC.context<Context>().create({
    transformer: superjson,
    errorFormatter({ shape }) {
        return shape;
    },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authentication
 * Use this for any endpoint that needs a logged-in user
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.user || !ctx.session) {
        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be logged in to access this resource",
        });
    }

    return next({
        ctx: {
            ...ctx,
            user: ctx.user, // Now user and session are guaranteed to exist
            session: ctx.session,
        },
    });
});
