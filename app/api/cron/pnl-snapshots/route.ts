import { NextRequest, NextResponse } from "next/server";
import { computePnlSnapshots } from "@/server/lib/pnl";
import { refreshMintPrices } from "@/server/lib/mint-prices";

// Rebuilds the realized-PnL snapshots for all three windows from confirmed
// trades (docs/exp-callouts.md §4b). Runs on the */10 slot after trade-verify.

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Prices first so the same pass marks open positions with fresh data.
    const prices = await refreshMintPrices().catch(() => ({ mints: 0, priced: 0 }));
    const [h24, d7, d30] = await Promise.all([
        computePnlSnapshots("24h"),
        computePnlSnapshots("7d"),
        computePnlSnapshots("30d"),
    ]);
    return NextResponse.json({ prices, "24h": h24, "7d": d7, "30d": d30 });
}
