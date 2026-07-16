// Market-data sweep for launched tokens — this IS the "token-stream worker"
// the cached columns on `tokens` were designed for. Runs every minute (the
// Cloudflare cron floor) so trade surfaces stay RPC-free on the read path;
// in-app swaps additionally trigger an instant per-token refresh via
// trade.syncToken, so our own activity never waits for the sweep.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { syncMarketData, syncCurveProgress, type SyncableToken } from "@/lib/tokens/market-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TOKENS = 90; // 3 GT calls per pass; oldest-synced first
const MAX_CURVE_READS = 40; // bound on-chain reads per pass

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db
        .select({ id: tokens.id, poolAddress: tokens.poolAddress, phase: tokens.phase })
        .from(tokens)
        .where(and(eq(tokens.status, "live"), isNotNull(tokens.poolAddress)))
        .orderBy(sql`${tokens.lastSyncedAt} asc nulls first`)
        .limit(MAX_TOKENS);

    if (rows.length === 0) return NextResponse.json({ tokens: 0, synced: 0, curves: 0 });

    const syncable = rows as SyncableToken[];
    const synced = await syncMarketData(syncable);
    const curves = await syncCurveProgress(syncable.slice(0, MAX_CURVE_READS));

    return NextResponse.json({ tokens: rows.length, synced, curves });
}
