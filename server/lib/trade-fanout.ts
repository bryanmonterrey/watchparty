import { db } from "@/db";
import { tokens, follows, notifications } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sendPushToUsers } from "@/lib/push/send";
import { CASH_MINTS } from "./pnl";

export interface FanOutTradeInput {
    id: string;
    userId: string;
    inputMint: string;
    outputMint: string;
    usdValue: number | null;
}

/**
 * Phase 4c: a confirmed trade by a sharing user becomes a follower signal —
 * in-app "trade" notification + web push. Never throws (fan-out is optional).
 * Called from the trade-verify cron (app swaps) and the helius-user-trades
 * webhook (external swaps). The token mint rides in notification.postId so
 * the panel can deep-link the row (one-tap copy).
 */
export async function fanOutTrade(t: FanOutTradeInput): Promise<void> {
    try {
        const [u] = await db
            .select({ shareTrades: user.shareTrades, name: user.name })
            .from(user)
            .where(eq(user.id, t.userId));
        if (!u?.shareTrades) return;

        const inCash = CASH_MINTS.has(t.inputMint);
        const outCash = CASH_MINTS.has(t.outputMint);
        if (inCash === outCash) return; // no cash side — nothing readable to say
        const mint = inCash ? t.outputMint : t.inputMint;
        const side = inCash ? "bought" : "sold";

        const [tok] = await db
            .select({ ticker: tokens.ticker })
            .from(tokens)
            .where(eq(tokens.tokenAddress, mint))
            .limit(1);
        const label = tok?.ticker ? `$${tok.ticker}` : `${mint.slice(0, 4)}…${mint.slice(-4)}`;
        const usd = t.usdValue ? ` — $${Math.round(t.usdValue).toLocaleString()}` : "";
        const body = `${side} ${label}${usd}`;

        const followerRows = await db
            .select({ followerId: follows.followerId })
            .from(follows)
            .where(eq(follows.followingId, t.userId));
        for (let i = 0; i < followerRows.length; i += 500) {
            const chunk = followerRows.slice(i, i + 500);
            await db.insert(notifications).values(chunk.map((f) => ({
                id: nanoid(),
                userId: f.followerId,
                actorId: t.userId,
                type: "trade" as const,
                postId: mint, // token slug for the copy-trade deep link
                body,
            })));
        }
        await sendPushToUsers(followerRows.map((f) => f.followerId), {
            title: `${u.name || "A trader you follow"} ${body}`,
            body: "Tap to see the token",
            url: `/${mint}`,
            tag: `trade-${t.id}`,
        });
    } catch { /* fan-out must never fail the caller */ }
}
