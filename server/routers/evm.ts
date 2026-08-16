import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { evmChainId, fetchEvmBuyQuote, EvmQuoteError } from "@/lib/chains/evm/swap";

// EVM trading. Its own router rather than a few more lines in trade.ts or
// wallet.ts because the file-size guard would reject both: trade.ts sits at 991
// of a 1000-line cap, and wallet.ts is allowlisted at its current size and may
// not grow. Splitting is the cheaper answer either way — nothing here shares
// state with the Solana paths.
export const evmRouter = router({
    /**
     * Quote a native-coin -> token buy, and hand back the transaction that
     * fills it.
     *
     * A QUERY, not a mutation, even though it is the thing a buy executes with:
     * quoting is a pure read, and making it a query is what lets the dialog
     * keep a live estimate on screen (react-query keys it by amount and
     * refetches as the user changes the number) without hand-rolling a
     * debounce. Nothing is signed or spent until the client sends the tx.
     */
    buyQuote: protectedProcedure
        .input(
            z.object({
                network: z.string(),
                tokenAddress: z.string(),
                /** Native coin amount in whole units (ETH), the unit the UI speaks. */
                amount: z.number().positive().max(1000),
                fromAddress: z.string(),
                /** Defaults to the board's own 2%, matching the Solana quick-buy. */
                slippageBps: z.number().int().min(1).max(5000).default(200),
            }),
        )
        .query(async ({ input }) => {
            const chainId = evmChainId(input.network);
            if (chainId === null) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    // Names the network so a board row on a chain we haven't
                    // enabled yet fails legibly instead of looking like a
                    // routing bug.
                    message: `${input.network} isn't tradeable in-app yet.`,
                });
            }

            try {
                return await fetchEvmBuyQuote({
                    chainId,
                    tokenAddress: input.tokenAddress,
                    amount: input.amount,
                    fromAddress: input.fromAddress,
                    slippageBps: input.slippageBps,
                });
            } catch (err) {
                // A missing route is a fact about the coin, not a server fault,
                // and the dialog shows this string verbatim — so it has to read
                // as an answer rather than a stack trace.
                if (err instanceof EvmQuoteError) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
                }
                throw err;
            }
        }),
});
