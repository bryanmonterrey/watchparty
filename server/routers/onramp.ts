import { z } from "zod";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { getChain } from "@/lib/chains/registry";
import { getAddressesByKind } from "@/lib/wallet/multichain";
import {
    createStripeOnrampSession,
    stripeOnrampConfigured,
    stripeSupportsChain,
    StripeOnrampError,
} from "@/lib/payments/stripe-onramp";

// Fiat -> crypto funding. Its own router because wallet.ts is allowlisted at
// its current size by the file-size guard and may not grow, and because this is
// a genuinely separate concern from signing: nothing here touches a key.
export const onrampRouter = router({
    /**
     * Whether card funding is available for a chain, and why not when it isn't.
     *
     * A query the UI calls BEFORE drawing the entry point, so an unconfigured
     * deployment or an unsupported chain renders nothing rather than a button
     * that fails after a click. Mirrors `wallet.getSwapSupport`.
     */
    support: protectedProcedure
        .input(z.object({ chain: z.string() }))
        .query(({ input }) => {
            const chain = getChain(input.chain);
            if (!chain) return { supported: false, reason: "Unknown chain" };
            if (!stripeOnrampConfigured()) {
                return { supported: false, reason: "Card funding isn't set up yet" };
            }
            if (!stripeSupportsChain(chain.id)) {
                return { supported: false, reason: `Card funding isn't available on ${chain.name}` };
            }
            return { supported: true, provider: "stripe" as const };
        }),

    /**
     * Open a funding session for the signed-in user's own address.
     *
     * The address is resolved SERVER-SIDE from the session rather than accepted
     * as input — a client-supplied destination would let anyone use our Stripe
     * account to fund an arbitrary wallet.
     */
    createStripeSession: protectedProcedure
        .input(
            z.object({
                chain: z.string(),
                usdAmount: z.number().positive().max(50_000).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const chain = getChain(input.chain);
            if (!chain) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown chain" });

            const addresses = await getAddressesByKind(ctx.user.id);
            const address = addresses[chain.kind];
            if (!address) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "No wallet on this chain yet — open your wallet to set one up",
                });
            }

            // Stripe uses the buyer's IP for its own risk and region checks; the
            // worker's IP would make every user look like one customer in one
            // place, which is exactly the pattern their fraud rules flag.
            const headersList = await headers();
            const customerIp = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();

            try {
                return await createStripeOnrampSession({
                    chainId: chain.id,
                    address,
                    usdAmount: input.usdAmount,
                    customerIp,
                });
            } catch (err) {
                if (err instanceof StripeOnrampError) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
                }
                throw err;
            }
        }),
});
