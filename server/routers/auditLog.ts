import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { wallet_access_log } from "@/db/schema/auth";
import { eq, desc } from "drizzle-orm";

export const auditLogRouter = router({
    /**
     * List audit logs for the current user
     * Returns the last 50 entries by default
     */
    list: protectedProcedure
        .input(
            z
                .object({
                    limit: z.number().min(1).max(100).default(50),
                })
                .optional()
        )
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 50;

            const logs = await db
                .select({
                    id: wallet_access_log.id,
                    action: wallet_access_log.action,
                    ipAddress: wallet_access_log.ip_address,
                    userAgent: wallet_access_log.user_agent,
                    success: wallet_access_log.success,
                    errorMessage: wallet_access_log.error_message,
                    metadata: wallet_access_log.metadata,
                    createdAt: wallet_access_log.created_at,
                })
                .from(wallet_access_log)
                .where(eq(wallet_access_log.user_id, ctx.user.id))
                .orderBy(desc(wallet_access_log.created_at))
                .limit(limit);

            return {
                success: true,
                logs,
            };
        }),
});
