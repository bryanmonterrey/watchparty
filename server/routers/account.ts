import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { account } from "@/db/schema/auth";
import { eq, and } from "drizzle-orm";
import { logWalletAccess } from "@/lib/security/audit-logger";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";

export const accountRouter = router({
    /**
     * List all linked accounts for the current user
     */
    list: protectedProcedure.query(async ({ ctx }) => {
        const userAccounts = await db
            .select({
                id: account.id,
                provider: account.providerId,
                providerId: account.accountId,
                createdAt: account.createdAt,
            })
            .from(account)
            .where(eq(account.userId, ctx.user.id));

        return {
            success: true,
            accounts: userAccounts,
        };
    }),

    /**
     * Unlink a social account from the user's profile
     */
    unlink: protectedProcedure
        .input(
            z.object({
                accountId: z.string(),
                provider: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Check if this is the last authentication method
            const userAccounts = await db
                .select()
                .from(account)
                .where(eq(account.userId, ctx.user.id));

            const hasWallet = !!ctx.user.wallet_address;
            const authMethodsCount = userAccounts.length + (hasWallet ? 1 : 0);

            if (authMethodsCount <= 1) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Cannot unlink your only authentication method",
                });
            }

            // Delete the account link
            await db
                .delete(account)
                .where(
                    and(
                        eq(account.id, input.accountId),
                        eq(account.userId, ctx.user.id)
                    )
                );

            // Log the action
            const headersList = await headers();
            const ipAddress =
                headersList.get("x-forwarded-for") ||
                headersList.get("x-real-ip") ||
                "unknown";
            const userAgent = headersList.get("user-agent") || "unknown";

            await logWalletAccess({
                userId: ctx.user.id,
                action: "account_unlinked" as any,
                ipAddress,
                userAgent,
                success: true,
                metadata: { provider: input.provider },
            });

            return {
                success: true,
                message: "Account unlinked successfully",
            };
        }),
});
