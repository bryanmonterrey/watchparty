import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import superjson from "superjson";
import { resolveBotToken } from "@/lib/developer/bot-auth";
import { limitOrPass, apiLimiter } from "@/lib/rate-limit";

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

    // Bot-token auth (phase 8). ONLY attempted when there's no cookie session
    // AND a `Bot <token>` header is present — so normal app traffic never pays
    // for the lookup. A bot deliberately gets NO `user`/`session`: its identity
    // rides `ctx.bot` alone, so every protectedProcedure rejects it by
    // construction (fail-closed — a bot can't reach a user endpoint even by
    // accident). Only the explicit botProcedure reads `ctx.bot`.
    let bot: { userId: string; appId: string } | null = null;
    if (!session?.user) {
        const authz = h.get("authorization");
        if (authz?.startsWith("Bot ")) {
            bot = await resolveBotToken(authz.slice(4).trim());
        }
    }

    return {
        session,
        user: session?.user ?? null,
        /**
         * The request headers. Procedures that need the CALLER rather than the
         * account use this — rate limits and per-viewer dedupe on public
         * endpoints, where there may be no user at all.
         */
        headers: h,
        /** Set only for a valid `Bot` token; null for everyone else. */
        bot,
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

/**
 * Bot procedure — requires a valid `Bot <token>`. This is the ONLY way a bot
 * reaches the API: protectedProcedure gives it no session, so bots are locked
 * out of every user endpoint by default, and each capability a bot may use is
 * opted in here explicitly. `ctx.bot` carries the bot's own user id + app id.
 */
export const botProcedure = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.bot) {
        throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "This endpoint requires a bot token (Authorization: Bot <token>)",
        });
    }
    // Per-bot rate limit (fail-open — Redis being down never locks a bot out).
    if (!(await limitOrPass(apiLimiter, `bot:${ctx.bot.userId}`))) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
    }
    return next({ ctx: { ...ctx, bot: ctx.bot } });
});
