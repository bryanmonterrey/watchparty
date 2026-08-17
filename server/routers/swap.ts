import { z } from "zod";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { getChain } from "@/lib/chains/registry";
import { getAddressesByKind } from "@/lib/wallet/multichain";
import { getSeedForUser } from "@/lib/wallet/seed";
import { humanToBaseUnits } from "@/lib/wallet/base-units";
import { withCache, invalidateCache } from "@/lib/cache";
import { logWalletAccess, checkRateLimit, getResetTime } from "@/lib/security/audit-logger";
import { crossChainSupport, getSwapQuote, executeSwap, NATIVE_TOKEN } from "@/lib/chains/swap";
import { getLifiTokenInfo } from "@/lib/chains/swap/lifi";

// CROSS-CHAIN swaps: spend a token on one chain, receive one on another.
//
// Its own router because wallet.ts is allowlisted at its current size by the
// file-size guard and may not grow, and because the shape genuinely differs —
// every input here names two chains, not one.
//
// The capability was always sitting in LI.FI; we were only ever asking it for
// same-chain routes. A bridged route still resolves to ONE transaction on the
// SOURCE chain, so this needed no new signing code.

const crossSwapInput = z.object({
    fromChain: z.string(),
    toChain: z.string(),
    /** Contract address, or the zero-address sentinel for the native coin. */
    fromToken: z.string(),
    toToken: z.string(),
    /** Human units ("0.25"), converted server-side using the token's real
     *  decimals — the client would have to fetch those itself otherwise. */
    amountHuman: z.string(),
    slippageBps: z.number().int().min(10).max(3000).default(200),
});

type CrossSwapInput = z.infer<typeof crossSwapInput>;

/**
 * Resolve both addresses, convert the amount, and quote.
 *
 * TWO addresses, and that is the part a same-chain path never needed: the
 * source address signs, the destination address receives, and they are
 * different strings whenever the chains differ in kind — an EVM address cannot
 * receive on Solana. Both come from the SESSION, never from input, so a caller
 * can't route someone else's funds to itself.
 */
async function resolveCrossQuote(userId: string, input: CrossSwapInput) {
    const from = getChain(input.fromChain);
    const to = getChain(input.toChain);
    if (!from || !to) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown chain" });
    }

    const support = crossChainSupport(from.id, to.id);
    if (!support.supported) {
        // The reason is written for a human and shown verbatim in the dialog.
        throw new TRPCError({ code: "BAD_REQUEST", message: support.reason ?? "Route unavailable" });
    }

    const addresses = await getAddressesByKind(userId);
    const fromAddress = addresses[from.kind];
    const toAddress = addresses[to.kind];
    if (!fromAddress) {
        throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No ${from.name} wallet yet — open your wallet to set one up`,
        });
    }
    if (!toAddress) {
        throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No ${to.name} wallet to receive on — open your wallet to set one up`,
        });
    }

    const fromDecimals =
        input.fromToken === NATIVE_TOKEN
            ? from.nativeCurrency.decimals
            : (
                  await withCache(`lifi-token:${from.id}:${input.fromToken.toLowerCase()}`, 86_400, () =>
                      getLifiTokenInfo(from.id, input.fromToken),
                  )
              ).decimals;

    let fromAmount: string;
    try {
        fromAmount = humanToBaseUnits(input.amountHuman, fromDecimals);
    } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
    }
    if (BigInt(fromAmount) <= BigInt(0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount is too small" });
    }

    try {
        const quote = await getSwapQuote(
            {
                chain: from.id,
                toChain: to.id,
                fromToken: input.fromToken,
                toToken: input.toToken,
                fromAmount,
                slippage: input.slippageBps / 10_000,
            },
            fromAddress,
            toAddress,
        );
        return { from, to, fromAddress, quote };
    } catch (err) {
        // LI.FI explains WHY a route failed ("no route found", "amount too
        // small"), and that is far more useful than a generic failure.
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: (err as Error)?.message ?? "No route found",
        });
    }
}

export const swapRouter = router({
    /** Whether a (from, to) pair can be routed, and why not when it can't. */
    support: protectedProcedure
        .input(z.object({ fromChain: z.string(), toChain: z.string() }))
        .query(({ input }) => crossChainSupport(input.fromChain, input.toChain)),

    /**
     * Quote a cross-chain swap. A query — quoting is a pure read, which is what
     * lets the dialog hold a live estimate keyed by amount without spending a
     * signature or hand-rolling a debounce.
     */
    quote: protectedProcedure.input(crossSwapInput).query(async ({ ctx, input }) => {
        const { quote, to } = await resolveCrossQuote(ctx.user.id, input);
        return {
            toAmount: quote.toAmount,
            toAmountMin: quote.toAmountMin,
            toSymbol: quote.toToken.symbol,
            toDecimals: quote.toToken.decimals,
            fromSymbol: quote.fromToken.symbol,
            fromDecimals: quote.fromToken.decimals,
            tool: quote.tool,
            /** True when this bridges. The UI says so, because arrival is not
             *  instant and the source receipt does not prove delivery. */
            crossChain: quote.toChain !== quote.chain,
            toChainName: to.name,
        };
    }),

    /**
     * Execute. RE-QUOTES server-side rather than executing a quote handed in by
     * the client, matching `wallet.swapEvm` — a client-held quote is never
     * trusted, so there is no window in which the price shown and the price
     * filled can diverge beyond the slippage bound.
     */
    execute: protectedProcedure.input(crossSwapInput).mutation(async ({ ctx, input }) => {
        const headersList = await headers();
        const ipAddress = headersList.get("x-forwarded-for") || "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";

        // AWAITED. Both helpers are async, and `!promise` is always false —
        // the same omission at three call sites in wallet.ts has left the
        // signing rate limit inert there (fixed in this commit).
        if (!(await checkRateLimit(ctx.user.id, "sign_transaction"))) {
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `Too many transactions. Try again after ${await getResetTime(ctx.user.id, "sign_transaction")}`,
            });
        }

        try {
            const { from, to, fromAddress, quote } = await resolveCrossQuote(ctx.user.id, input);
            const seed = await getSeedForUser(ctx.user.id);
            const result = await executeSwap(seed, quote);

            await logWalletAccess({
                userId: ctx.user.id,
                action: "sign_transaction",
                ipAddress,
                userAgent,
                success: true,
            });

            // Only the SOURCE balance is known to have changed. The destination
            // is still bridging, so busting its cache here would just cache the
            // pre-arrival balance a moment earlier.
            await invalidateCache(`assets:${from.id}:${fromAddress}`);

            return {
                txId: result.txId,
                explorerUrl: result.explorerUrl,
                crossChain: !!result.crossChain,
                toChainName: to.name,
                toAmount: quote.toAmount,
                toDecimals: quote.toToken.decimals,
                toSymbol: quote.toToken.symbol,
            };
        } catch (err) {
            await logWalletAccess({
                userId: ctx.user.id,
                action: "sign_transaction",
                ipAddress,
                userAgent,
                success: false,
            });
            if (err instanceof TRPCError) throw err;
            throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error)?.message ?? "Swap failed" });
        }
    }),
});
