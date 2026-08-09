import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { apiKeys } from "@/db/schema/content/api-key";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
    balKey,
    gateRedis,
    hmacHex,
    randHex,
    revokedKey,
    sha256Hex,
    spentKey,
} from "@/lib/api-gate";

// Management for the 402 gate's credits-backed API keys (lib/api-gate.ts).
//
// The plaintext key exists exactly once: in create's return value. The DB
// keeps sha256(key) for identification and the HMAC secret proves validity at
// request time, so a DB leak yields no usable keys. Redis is the live balance
// the edge gate debits; every mutation here keeps it in step, and
// /api/cron/api-credits-flush repairs any drift.

const MAX_ACTIVE_KEYS = 10;

export const apiKeysRouter = router({
    create: protectedProcedure
        .input(z.object({ name: z.string().trim().min(1).max(64) }))
        .mutation(async ({ ctx, input }) => {
            const secret = process.env.API_GATE_SECRET;
            if (!secret) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "API keys are not enabled on this deployment",
                });
            }

            const [{ n }] = await db
                .select({ n: count() })
                .from(apiKeys)
                .where(and(eq(apiKeys.userId, ctx.user.id), isNull(apiKeys.revokedAt)));
            if (n >= MAX_ACTIVE_KEYS) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You already have ${MAX_ACTIVE_KEYS} active keys — revoke one first`,
                });
            }

            const id = randHex(8);
            const sig = (await hmacHex(secret, id)).slice(0, 32);
            const plaintext = `wp_live_${id}.${sig}`;

            await db.insert(apiKeys).values({
                id,
                userId: ctx.user.id,
                name: input.name,
                keyHash: await sha256Hex(plaintext),
                prefix: `wp_live_${id.slice(0, 4)}…`,
            });

            // Shown once, never stored. New keys have zero credits until funded.
            return { id, key: plaintext };
        }),

    list: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({
                id: apiKeys.id,
                name: apiKeys.name,
                prefix: apiKeys.prefix,
                balanceMicro: apiKeys.balanceMicro,
                spentMicro: apiKeys.spentMicro,
                revokedAt: apiKeys.revokedAt,
                createdAt: apiKeys.createdAt,
                lastUsedAt: apiKeys.lastUsedAt,
            })
            .from(apiKeys)
            .where(eq(apiKeys.userId, ctx.user.id))
            .orderBy(desc(apiKeys.createdAt));
        if (!rows.length) return [];

        // The live (Redis) balance already reflects spend the flush cron hasn't
        // written back yet; the DB value is the fallback when Redis is cold.
        let live: (number | null)[] = rows.map(() => null);
        try {
            live = (await gateRedis().mget(...rows.map((r) => balKey(r.id)))) as (number | null)[];
        } catch {
            /* fall back to ledger balances */
        }

        return rows.map((r, i) => ({
            id: r.id,
            name: r.name,
            prefix: r.prefix,
            revoked: !!r.revokedAt,
            createdAt: r.createdAt,
            lastUsedAt: r.lastUsedAt,
            balanceUsd: (live[i] ?? r.balanceMicro) / 1_000_000,
            spentUsd: r.spentMicro / 1_000_000,
        }));
    }),

    revoke: protectedProcedure
        .input(z.object({ id: z.string().min(1).max(64) }))
        .mutation(async ({ ctx, input }) => {
            const [row] = await db
                .update(apiKeys)
                .set({ revokedAt: new Date() })
                .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id)))
                .returning({ id: apiKeys.id });
            if (!row) throw new TRPCError({ code: "NOT_FOUND" });

            // Redis is what the gate actually consults; the flush cron
            // re-asserts this marker if the write below is lost.
            try {
                const r = gateRedis();
                await Promise.all([r.set(revokedKey(input.id), "1"), r.del(balKey(input.id))]);
            } catch {
                /* cron backstop */
            }
            return { ok: true };
        }),

    /**
     * Admin credit grant — the manual funding path until a self-serve USDC
     * purchase flow ships. Folds unflushed Redis spend into the ledger first
     * so the SET below can't resurrect already-spent credits.
     */
    grant: protectedProcedure
        .input(z.object({ keyId: z.string().min(1).max(64), amountUsd: z.number().min(1).max(100_000) }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

            let unflushed = 0;
            try {
                unflushed = Number((await gateRedis().getdel(spentKey(input.keyId))) ?? 0);
            } catch {
                /* flush cron will reconcile */
            }

            const micro = Math.round(input.amountUsd * 1_000_000);
            const [row] = await db
                .update(apiKeys)
                .set({
                    spentMicro: sql`${apiKeys.spentMicro} + ${unflushed}`,
                    balanceMicro: sql`${apiKeys.balanceMicro} - ${unflushed} + ${micro}`,
                })
                .where(and(eq(apiKeys.id, input.keyId), isNull(apiKeys.revokedAt)))
                .returning({ balanceMicro: apiKeys.balanceMicro });
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No active key with that id" });

            try {
                await gateRedis().set(balKey(input.keyId), row.balanceMicro);
            } catch {
                /* flush cron reseeds from the ledger */
            }
            return { balanceUsd: row.balanceMicro / 1_000_000 };
        }),
});
