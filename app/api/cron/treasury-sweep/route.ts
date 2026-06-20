// Auto-sweep treasury profit to a cold wallet (a multisig). Fully unattended:
// sending TO cold needs no approval. Keeps enough hot USDC to cover ALL unclaimed
// creator earnings (so creators can always claim), and sweeps everything above
// that — plus a buffer — to cold. This is what makes the system require zero
// manual USDC transfers. Secret-guarded; schedule alongside premium-collect.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creatorEarnings } from "@/db/schema/content";
import { eq, sum } from "drizzle-orm";
import { getCollectorUsdcBalance, sweepUsdcToCold } from "@/lib/chains/solana/subscriptions/collector";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const USDC = 1_000_000;
const BUFFER = 1 * USDC;       // keep a little slack on top of obligations
const MIN_SWEEP = 5 * USDC;    // don't sweep dust (wastes fees)

export async function GET(req: NextRequest) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cold = process.env.TREASURY_COLD_PUBKEY;
    if (!cold) {
        return NextResponse.json({ skipped: "TREASURY_COLD_PUBKEY not configured" });
    }

    // Money owed to creators that hasn't been claimed yet must stay hot.
    const [row] = await db
        .select({ owed: sum(creatorEarnings.amountUsdc) })
        .from(creatorEarnings)
        .where(eq(creatorEarnings.claimed, false));
    const owed = Number(row?.owed ?? 0);

    const balance = Number(await getCollectorUsdcBalance());
    const reserve = owed + BUFFER;
    const sweepable = balance - reserve;

    if (sweepable < MIN_SWEEP) {
        return NextResponse.json({ swept: 0, balance, owed, reserve });
    }

    const signature = await sweepUsdcToCold(cold, BigInt(sweepable));
    return NextResponse.json({ swept: sweepable, balance, owed, reserve, signature });
}
