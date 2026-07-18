import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trades, tokens, follows, notifications } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createServerConnection } from "@/lib/solana/server-connection";
import { sendPushToUsers } from "@/lib/push/send";
import { CASH_MINTS } from "@/server/lib/pnl";

// Settles pending trades on-chain (docs/exp-callouts.md §4a): the pending row
// was inserted server-side at getSwapTransaction with server-witnessed
// amounts, the client attached the signature — here the chain is the source
// of truth for whether it actually landed. Runs on the */10 cron slot next to
// callout-performance.

const REPORT_WINDOW_MS = 60 * 60 * 1000; // unreported after 1h → abandoned
const VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000; // reported but unfindable after 24h → failed

interface ConfirmedTrade {
    id: string;
    userId: string;
    inputMint: string;
    outputMint: string;
    usdValue: number | null;
}

// Phase 4c: a confirmed trade by a sharing user becomes a follower signal —
// in-app "trade" notification + web push. Never throws (fan-out is optional).
async function fanOutTrade(t: ConfirmedTrade): Promise<void> {
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
                body,
            })));
        }
        await sendPushToUsers(followerRows.map((f) => f.followerId), {
            title: `${u.name || "A trader you follow"} ${body}`,
            body: "Tap to see the token",
            url: tok ? `/${mint}` : "/trade",
            tag: `trade-${t.id}`,
        });
    } catch { /* fan-out must never fail verification */ }
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Abandoned: never got a signature (user rejected / tab died before send).
    const abandoned = await db
        .update(trades)
        .set({ status: "failed" })
        .where(and(
            eq(trades.status, "pending"),
            isNull(trades.txSignature),
            lt(trades.createdAt, new Date(Date.now() - REPORT_WINDOW_MS)),
        ))
        .returning({ id: trades.id });

    // Reported: check signatures on-chain, oldest first, one RPC batch.
    const pending = await db
        .select({
            id: trades.id,
            userId: trades.userId,
            txSignature: trades.txSignature,
            createdAt: trades.createdAt,
            inputMint: trades.inputMint,
            outputMint: trades.outputMint,
            usdValue: trades.usdValue,
        })
        .from(trades)
        .where(and(
            eq(trades.status, "pending"),
            isNotNull(trades.txSignature),
        ))
        .orderBy(trades.createdAt)
        .limit(50);

    let confirmed = 0;
    let failed = 0;
    if (pending.length > 0) {
        const connection = createServerConnection();
        const statuses = await connection.getSignatureStatuses(
            pending.map((t) => t.txSignature!),
            { searchTransactionHistory: true },
        );
        for (let i = 0; i < pending.length; i++) {
            const t = pending[i];
            const st = statuses.value[i];
            if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
                if (st.err) {
                    await db.update(trades).set({ status: "failed" }).where(eq(trades.id, t.id));
                    failed++;
                } else {
                    await db.update(trades).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(trades.id, t.id));
                    confirmed++;
                    await fanOutTrade(t);
                }
            } else if (!st && t.createdAt.getTime() < Date.now() - VERIFY_WINDOW_MS) {
                // Signature never landed (dropped / expired blockhash).
                await db.update(trades).set({ status: "failed" }).where(eq(trades.id, t.id));
                failed++;
            }
        }
    }

    return NextResponse.json({ checked: pending.length, confirmed, failed, abandoned: abandoned.length });
}
