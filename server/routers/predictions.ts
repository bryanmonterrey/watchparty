// Predictions v1 — in-house pari-mutuel markets (USDC, treasury rails).
//
// Money flow (all pieces already proven elsewhere in the app):
//   bet    → client transfers USDC to the treasury ATA and submits the tx
//            signature; we verify the transfer on-chain (same pattern as
//            community.purchaseBoosts). tx_signature UNIQUE = redeems once.
//   payout → winners claim; treasury pays via transferUsdcFromTreasury
//            (same rail as creator-subs claims).
//
// Pari-mutuel math: winners get their stake back plus a pro-rata share of the
// losing pools minus the fee. The rake applies to the LOSING pool only, so a
// market where everyone picked the same side degrades to a clean refund.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { predictionMarkets, predictionOutcomes, predictionBets } from "@/db/schema/content/predictions";
import { eq, and, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { USDC_MINT } from "@/lib/premium/tiers";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";

const MIN_BET_USDC = BigInt(1_000_000); // $1
const MAX_BET_USDC = BigInt(5_000_000_000); // $5k

const adminOnly = (role: string | null | undefined) => {
    if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
};

/** Verify a confirmed USDC transfer of ≥`expected` to the treasury ATA. */
async function verifyUsdcPayment(txSignature: string, expected: bigint): Promise<void> {
    const res = await fetch(getRpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [txSignature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
        }),
    });
    const tx = (await res.json())?.result;
    if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found yet — wait a moment and retry" });
    if (tx.meta?.err) throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction failed on-chain" });
    if (tx.blockTime && Date.now() / 1000 - tx.blockTime > 2 * 60 * 60) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment too old to redeem" });
    }

    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    const { PublicKey } = await import("@solana/web3.js");
    const treasuryAta = getAssociatedTokenAddressSync(
        new PublicKey(USDC_MINT),
        new PublicKey(getBoostTreasuryOwner()),
        true,
    ).toBase58();

    type ParsedIx = { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
    const instructions: ParsedIx[] = [
        ...(tx.transaction?.message?.instructions ?? []),
        ...((tx.meta?.innerInstructions ?? []) as { instructions: ParsedIx[] }[]).flatMap((i) => i.instructions),
    ];
    const paid = instructions.some((ix) => {
        if (ix.program !== "spl-token") return false;
        const { type, info } = ix.parsed ?? {};
        if ((type !== "transfer" && type !== "transferChecked") || !info) return false;
        if (info.destination !== treasuryAta) return false;
        const raw = type === "transfer"
            ? (info.amount as string | undefined)
            : (info.tokenAmount as { amount?: string } | undefined)?.amount;
        return !!raw && BigInt(raw) >= expected;
    });
    if (!paid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No matching USDC payment to the treasury in that transaction" });
    }
}

/** Winner payout for one bet, in base units. Stake + pro-rata net winnings. */
function winnerPayout(stake: bigint, winningPool: bigint, losingPool: bigint, feeBps: number): bigint {
    if (winningPool <= BigInt(0)) return stake;
    const netLosing = (losingPool * BigInt(10_000 - feeBps)) / BigInt(10_000);
    return stake + (stake * netLosing) / winningPool;
}

export const predictionsRouter = router({
    /** Markets for the Predictions page: open first, then recently resolved. */
    list: publicProcedure
        .input(z.object({ category: z.string().optional() }).optional())
        .query(async ({ input }) => {
            const where = input?.category ? eq(predictionMarkets.category, input.category) : undefined;
            const markets = await db
                .select()
                .from(predictionMarkets)
                .where(where)
                .orderBy(
                    sql`CASE ${predictionMarkets.status} WHEN 'open' THEN 0 ELSE 1 END`,
                    desc(predictionMarkets.createdAt),
                )
                .limit(60);
            if (markets.length === 0) return [];

            const outcomes = await db
                .select()
                .from(predictionOutcomes)
                .where(inArray(predictionOutcomes.marketId, markets.map((m) => m.id)))
                .orderBy(asc(predictionOutcomes.idx));
            const byMarket = new Map<string, typeof outcomes>();
            for (const o of outcomes) {
                byMarket.set(o.marketId, [...(byMarket.get(o.marketId) ?? []), o]);
            }
            return markets.map((m) => ({
                ...m,
                outcomes: (byMarket.get(m.id) ?? []).map((o) => ({ ...o, poolUsdc: o.poolUsdc.toString() })),
            }));
        }),

    /** One market + outcomes + the caller's bets (with claimable payouts). */
    get: protectedProcedure
        .input(z.object({ marketId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const [market] = await db
                .select()
                .from(predictionMarkets)
                .where(eq(predictionMarkets.id, input.marketId))
                .limit(1);
            if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });

            const outcomes = await db
                .select()
                .from(predictionOutcomes)
                .where(eq(predictionOutcomes.marketId, market.id))
                .orderBy(asc(predictionOutcomes.idx));
            const myBets = await db
                .select()
                .from(predictionBets)
                .where(and(eq(predictionBets.marketId, market.id), eq(predictionBets.userId, ctx.user.id)))
                .orderBy(desc(predictionBets.createdAt));

            const winningPool = market.winningOutcome != null
                ? outcomes.find((o) => o.idx === market.winningOutcome)?.poolUsdc ?? BigInt(0)
                : BigInt(0);
            const totalPool = outcomes.reduce((s, o) => s + o.poolUsdc, BigInt(0));
            const losingPool = totalPool - winningPool;

            return {
                ...market,
                outcomes: outcomes.map((o) => ({ ...o, poolUsdc: o.poolUsdc.toString() })),
                myBets: myBets.map((b) => {
                    let claimable = BigInt(0);
                    if (!b.claimedAt) {
                        if (market.status === "voided") claimable = b.amountUsdc;
                        else if (market.status === "resolved" && b.outcomeIdx === market.winningOutcome) {
                            claimable = winnerPayout(b.amountUsdc, winningPool, losingPool, market.feeBps);
                        }
                    }
                    return {
                        ...b,
                        amountUsdc: b.amountUsdc.toString(),
                        payoutUsdc: b.payoutUsdc?.toString() ?? null,
                        claimable: claimable.toString(),
                    };
                }),
            };
        }),

    /**
     * Place a bet: the client has already transferred USDC to the treasury;
     * we verify the payment and credit the pool. One signature = one bet.
     */
    placeBet: protectedProcedure
        .input(z.object({
            marketId: z.string().uuid(),
            outcomeIdx: z.number().int().min(0).max(9),
            amountUsdc: z.string().regex(/^\d+$/), // base units
            txSignature: z.string().min(64).max(120),
        }))
        .mutation(async ({ ctx, input }) => {
            const amount = BigInt(input.amountUsdc);
            if (amount < MIN_BET_USDC || amount > MAX_BET_USDC) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Bets are $1 to $5,000" });
            }

            const [market] = await db
                .select()
                .from(predictionMarkets)
                .where(eq(predictionMarkets.id, input.marketId))
                .limit(1);
            if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
            if (market.status !== "open" || market.closesAt.getTime() <= Date.now()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Betting is closed on this market" });
            }
            const [outcome] = await db
                .select({ id: predictionOutcomes.id })
                .from(predictionOutcomes)
                .where(and(eq(predictionOutcomes.marketId, market.id), eq(predictionOutcomes.idx, input.outcomeIdx)))
                .limit(1);
            if (!outcome) throw new TRPCError({ code: "NOT_FOUND", message: "Outcome not found" });

            const already = await db
                .select({ id: predictionBets.id })
                .from(predictionBets)
                .where(eq(predictionBets.txSignature, input.txSignature))
                .limit(1);
            if (already.length) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            await verifyUsdcPayment(input.txSignature, amount);

            // Insert first — the UNIQUE tx_signature is the double-spend gate.
            const [bet] = await db
                .insert(predictionBets)
                .values({
                    marketId: market.id,
                    outcomeIdx: input.outcomeIdx,
                    userId: ctx.user.id,
                    amountUsdc: amount,
                    txSignature: input.txSignature,
                })
                .onConflictDoNothing()
                .returning();
            if (!bet) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            await db
                .update(predictionOutcomes)
                .set({ poolUsdc: sql`${predictionOutcomes.poolUsdc} + ${amount}` })
                .where(eq(predictionOutcomes.id, outcome.id));

            return { betId: bet.id };
        }),

    /** Claim a resolved win (or a voided-market refund). Pays from treasury. */
    claim: protectedProcedure
        .input(z.object({ betId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [bet] = await db
                .select()
                .from(predictionBets)
                .where(and(eq(predictionBets.id, input.betId), eq(predictionBets.userId, ctx.user.id)))
                .limit(1);
            if (!bet) throw new TRPCError({ code: "NOT_FOUND", message: "Bet not found" });
            if (bet.claimedAt) throw new TRPCError({ code: "CONFLICT", message: "Already claimed" });

            const [market] = await db
                .select()
                .from(predictionMarkets)
                .where(eq(predictionMarkets.id, bet.marketId))
                .limit(1);
            if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });

            let payout: bigint;
            if (market.status === "voided") {
                payout = bet.amountUsdc;
            } else if (market.status === "resolved" && bet.outcomeIdx === market.winningOutcome) {
                const outcomes = await db
                    .select()
                    .from(predictionOutcomes)
                    .where(eq(predictionOutcomes.marketId, market.id));
                const winningPool = outcomes.find((o) => o.idx === market.winningOutcome)?.poolUsdc ?? BigInt(0);
                const totalPool = outcomes.reduce((s, o) => s + o.poolUsdc, BigInt(0));
                payout = winnerPayout(bet.amountUsdc, winningPool, totalPool - winningPool, market.feeBps);
            } else {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to claim on this bet" });
            }

            // Claim-once gate BEFORE moving money: only the row transition
            // claimed_at NULL → now() proceeds; a concurrent claim loses here.
            const [locked] = await db
                .update(predictionBets)
                .set({ claimedAt: new Date(), payoutUsdc: payout })
                .where(and(eq(predictionBets.id, bet.id), isNull(predictionBets.claimedAt)))
                .returning({ id: predictionBets.id });
            if (!locked) throw new TRPCError({ code: "CONFLICT", message: "Already claimed" });

            const wallet = ctx.user.wallet_address;
            if (!wallet) {
                // roll the gate back — nothing was paid
                await db.update(predictionBets).set({ claimedAt: null, payoutUsdc: null }).where(eq(predictionBets.id, bet.id));
                throw new TRPCError({ code: "BAD_REQUEST", message: "Link a wallet to receive your payout" });
            }

            try {
                const { transferUsdcFromTreasury } = await import("@/lib/chains/solana/subscriptions/collector");
                const sig = await transferUsdcFromTreasury(wallet, payout);
                await db.update(predictionBets).set({ claimSignature: sig }).where(eq(predictionBets.id, bet.id));
                return { payoutUsdc: payout.toString(), signature: sig };
            } catch (err) {
                await db.update(predictionBets).set({ claimedAt: null, payoutUsdc: null }).where(eq(predictionBets.id, bet.id));
                console.error("prediction claim payout failed:", err);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payout failed — nothing was deducted, try again" });
            }
        }),

    // ─── Admin ────────────────────────────────────────────

    createMarket: protectedProcedure
        .input(z.object({
            question: z.string().min(8).max(200),
            description: z.string().max(1000).optional(),
            category: z.string().min(2).max(30).default("general"),
            imageUrl: z.string().url().optional(),
            closesAt: z.string().datetime(),
            outcomes: z.array(z.string().min(1).max(60)).min(2).max(10),
            feeBps: z.number().int().min(0).max(1000).default(500),
        }))
        .mutation(async ({ ctx, input }) => {
            adminOnly(ctx.user.role);
            const closesAt = new Date(input.closesAt);
            if (closesAt.getTime() <= Date.now()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Close time must be in the future" });
            }

            const [market] = await db
                .insert(predictionMarkets)
                .values({
                    question: input.question.trim(),
                    description: input.description?.trim() || null,
                    category: input.category,
                    imageUrl: input.imageUrl ?? null,
                    creatorId: ctx.user.id,
                    closesAt,
                    feeBps: input.feeBps,
                })
                .returning();
            await db.insert(predictionOutcomes).values(
                input.outcomes.map((label, idx) => ({ marketId: market.id, idx, label: label.trim() })),
            );
            return market;
        }),

    resolve: protectedProcedure
        .input(z.object({
            marketId: z.string().uuid(),
            winningOutcome: z.number().int().min(0).max(9),
            note: z.string().max(500).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            adminOnly(ctx.user.role);
            // Shared with the AI factory cron — marks the winner + credits
            // referral rewards on the losing pool's rake.
            const { resolveMarketCore } = await import("@/lib/predictions/resolve");
            const updated = await resolveMarketCore(input.marketId, input.winningOutcome, input.note);
            if (!updated) throw new TRPCError({ code: "BAD_REQUEST", message: "Outcome not found or market is not open" });
            return updated;
        }),

    /** Void a market — every bet becomes a full refund claim. */
    voidMarket: protectedProcedure
        .input(z.object({ marketId: z.string().uuid(), note: z.string().max(500).optional() }))
        .mutation(async ({ ctx, input }) => {
            adminOnly(ctx.user.role);
            const [updated] = await db
                .update(predictionMarkets)
                .set({ status: "voided", resolvedAt: new Date(), resolutionNote: input.note ?? null })
                .where(and(eq(predictionMarkets.id, input.marketId), eq(predictionMarkets.status, "open")))
                .returning();
            if (!updated) throw new TRPCError({ code: "BAD_REQUEST", message: "Market is not open" });
            return updated;
        }),
});
