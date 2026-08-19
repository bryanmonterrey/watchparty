import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { account } from "@/db/schema/auth";
import { eq, and } from "drizzle-orm";
import { logWalletAccess } from "@/lib/security/audit-logger";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { linkedWallets } from "@/db/schema/auth/linked-wallets";

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

            // Counted through linked_wallets, not the primary mirror.
            //
            // `user.wallet_address` is NULL for an account whose only wallet is
            // external EVM, so this UNDERCOUNTED sign-in methods and refused an
            // unlink that was actually safe. It failed closed, which is the
            // right direction for a lockout guard — but "you can't unlink this"
            // for someone holding three wallets is still wrong.
            const [walletRow] = await db
                .select({ id: linkedWallets.id })
                .from(linkedWallets)
                .where(eq(linkedWallets.user_id, ctx.user.id))
                .limit(1);
            const hasWallet = !!walletRow || !!ctx.user.wallet_address;
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
