import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trades } from "@/db/schema/content";
import { and, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { createServerConnection } from "@/lib/solana/server-connection";

// Settles pending trades on-chain (docs/exp-callouts.md §4a): the pending row
// was inserted server-side at getSwapTransaction with server-witnessed
// amounts, the client attached the signature — here the chain is the source
// of truth for whether it actually landed. Runs on the */10 cron slot next to
// callout-performance.

const REPORT_WINDOW_MS = 60 * 60 * 1000; // unreported after 1h → abandoned
const VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000; // reported but unfindable after 24h → failed

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
        .select({ id: trades.id, txSignature: trades.txSignature, createdAt: trades.createdAt })
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
