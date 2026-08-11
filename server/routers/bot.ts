import { eq } from "drizzle-orm";
import { router, botProcedure } from "@/server/trpc";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";

// Bot-FACING endpoints — reached with `Authorization: Bot <token>`, never a
// user session. This is the whole surface a bot can touch today: it can learn
// who it is. Capabilities that ACT (post in a community it's installed in) are
// the next slice and get added here one botProcedure at a time — a bot can do
// nothing that isn't explicitly opted in.
export const botRouter = router({
    whoami: botProcedure.query(async ({ ctx }) => {
        const [row] = await db
            .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url })
            .from(user)
            .where(eq(user.id, ctx.bot.userId))
            .limit(1);
        return {
            botUserId: ctx.bot.userId,
            appId: ctx.bot.appId,
            name: row?.name ?? null,
            username: row?.username ?? null,
            avatarUrl: row?.avatar_url ?? null,
        };
    }),
});
