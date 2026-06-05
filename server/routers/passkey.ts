import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { passkey } from "@/db/schema/auth";
import { eq, and, desc } from "drizzle-orm";
import {
    logWalletAccess,
    checkRateLimit,
    getResetTime,
} from "@/lib/security/audit-logger";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";

export const passkeyRouter = router({
    /**
     * List all passkeys for the current user
     */
    list: protectedProcedure.query(async ({ ctx }) => {
        const userPasskeys = await db
            .select({
                id: passkey.id,
                name: passkey.name,
                deviceType: passkey.deviceType,
                createdAt: passkey.createdAt,
                backedUp: passkey.backedUp,
            })
            .from(passkey)
            .where(eq(passkey.userId, ctx.user.id))
            .orderBy(desc(passkey.createdAt));

        return {
            success: true,
            passkeys: userPasskeys,
        };
    }),

    /**
     * Delete a passkey
     */
    delete: protectedProcedure
        .input(
            z.object({
                passkeyId: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress =
                headersList.get("x-forwarded-for") ||
                headersList.get("x-real-ip") ||
                "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            // Check rate limit
            if (await checkRateLimit(ctx.user.id, "passkey_removed")) {
                const resetTime = await getResetTime(ctx.user.id, "passkey_removed");
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: `Rate limit exceeded. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
                });
            }

            // Check if this is the user's last passkey
            const userPasskeys = await db
                .select()
                .from(passkey)
                .where(eq(passkey.userId, ctx.user.id));

            if (userPasskeys.length <= 1) {
                await logWalletAccess({
                    userId: ctx.user.id,
                    action: "passkey_removed",
                    ipAddress,
                    userAgent,
                    success: false,
                    errorMessage: "Cannot delete last passkey",
                });

                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Cannot delete your last passkey",
                });
            }

            // Delete the passkey (ensure it belongs to the user)
            const result = await db
                .delete(passkey)
                .where(
                    and(
                        eq(passkey.id, input.passkeyId),
                        eq(passkey.userId, ctx.user.id)
                    )
                )
                .returning();

            if (result.length === 0) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Passkey not found",
                });
            }

            // Log the deletion
            await logWalletAccess({
                userId: ctx.user.id,
                action: "passkey_removed",
                ipAddress,
                userAgent,
                success: true,
                metadata: { passkeyId: input.passkeyId },
            });

            return {
                success: true,
                message: "Passkey deleted successfully",
            };
        }),

    /**
     * Rename a passkey
     */
    rename: protectedProcedure
        .input(
            z.object({
                passkeyId: z.string(),
                name: z.string().min(1).max(100),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const headersList = await headers();
            const ipAddress =
                headersList.get("x-forwarded-for") ||
                headersList.get("x-real-ip") ||
                "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            // Update passkey name (ensure it belongs to the user)
            const result = await db
                .update(passkey)
                .set({ name: input.name })
                .where(
                    and(
                        eq(passkey.id, input.passkeyId),
                        eq(passkey.userId, ctx.user.id)
                    )
                )
                .returning();

            if (result.length === 0) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Passkey not found",
                });
            }

            // Log the rename action
            await logWalletAccess({
                userId: ctx.user.id,
                action: "passkey_renamed",
                ipAddress,
                userAgent,
                success: true,
                metadata: { passkeyId: input.passkeyId, newName: input.name },
            });

            return {
                success: true,
                passkey: result[0],
            };
        }),
});
