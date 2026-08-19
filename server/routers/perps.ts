import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { linkedWallets } from "@/db/schema/auth/linked-wallets";
import { eq } from "drizzle-orm";
import { awardXP } from "@/server/lib/xp";
import { recordQuestEvent } from "@/server/lib/quests";

// Perps fills execute client-side on Flash's ephemeral rollup (session-signed,
// no server involvement), so XP rides a *verified* client report: we fetch the
// reported signature from the public ER RPC and require (1) the tx exists and
// succeeded, and (2) the caller's linked wallet appears in its account keys —
// so you can't claim someone else's fill or a made-up signature. The XP dedupe
// index (refId = signature) makes each fill pay once.

const ER_RPC = process.env.NEXT_PUBLIC_FLASH_ER_RPC ?? "https://flash.magicblock.xyz";

type ParsedKey = { pubkey?: string } | string;

async function fetchTxAccountKeys(signature: string): Promise<string[] | null> {
    const res = await fetch(ER_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
        }),
    });
    const tx = (await res.json())?.result;
    if (!tx || tx.meta?.err) return null;
    const keys: string[] = [];
    for (const k of (tx.transaction?.message?.accountKeys ?? []) as ParsedKey[]) {
        keys.push(typeof k === "string" ? k : k.pubkey ?? "");
    }
    for (const k of tx.meta?.loadedAddresses?.writable ?? []) keys.push(k);
    for (const k of tx.meta?.loadedAddresses?.readonly ?? []) keys.push(k);
    return keys;
}

export const perpsRouter = router({
    /** Report a filled open — verified against the ER before any XP moves. */
    reportFill: protectedProcedure
        .input(z.object({ signature: z.string().min(64).max(120) }))
        .mutation(async ({ ctx, input }) => {
            // EVERY wallet on the account, not just the primary.
            //
            // This compared the fill's account keys against
            // `user.wallet_address`, which mirrors ONE of up to 15 linked
            // wallets — so trading perps from any other wallet had the fill
            // rejected as "doesn't belong to your wallet", losing the XP and
            // the quest credit for a trade the user really made. Same shape as
            // the sign-in 401 (0ec39828): matching the primary is SUFFICIENT
            // evidence the wallet is theirs, never NECESSARY.
            const mine = await db
                .select({ address: linkedWallets.address })
                .from(linkedWallets)
                .where(eq(linkedWallets.user_id, ctx.user.id));
            const [me] = await db
                .select({ wallet: user.wallet_address })
                .from(user)
                .where(eq(user.id, ctx.user.id));

            const wallets = new Set(
                [...mine.map((w) => w.address), me?.wallet].filter(Boolean) as string[],
            );
            if (wallets.size === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No linked wallet" });

            const keys = await fetchTxAccountKeys(input.signature);
            if (!keys) throw new TRPCError({ code: "NOT_FOUND", message: "Fill not found on the ER yet — it may still be settling" });
            if (!keys.some((k) => wallets.has(k))) {
                throw new TRPCError({ code: "FORBIDDEN", message: "That fill doesn't belong to your wallet" });
            }

            const award = await awardXP(ctx.user.id, "perps_trade", input.signature);
            await recordQuestEvent(ctx.user.id, "perps_trade");
            return { awarded: award.awarded, leveledUp: award.leveledUp ?? null };
        }),
});
