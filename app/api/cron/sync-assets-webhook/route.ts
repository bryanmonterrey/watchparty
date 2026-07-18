// Daily sync of the Helius webhook address lists — wallet-assets (users who
// linked a wallet since the last run) and token-trades (pools launched since;
// normally already added at launch, this is the self-heal). Secret-guarded
// like the other crons; safe to run any time (idempotent PUT keyed on URL).
import { NextRequest, NextResponse } from "next/server";
import { syncAssetsWebhook } from "@/lib/wallet/assets-webhook";
import { syncTradesWebhook } from "@/lib/tokens/trades-webhook";
import { syncUserTradesWebhook } from "@/lib/wallet/user-trades-webhook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [assets, trades, userTrades] = await Promise.allSettled([syncAssetsWebhook(), syncTradesWebhook(), syncUserTradesWebhook()]);
    const out = {
        assets: assets.status === "fulfilled" ? assets.value : { error: String(assets.reason) },
        trades: trades.status === "fulfilled" ? trades.value : { error: String(trades.reason) },
        userTrades: userTrades.status === "fulfilled" ? userTrades.value : { error: String(userTrades.reason) },
    };
    const ok = assets.status === "fulfilled" && trades.status === "fulfilled" && userTrades.status === "fulfilled";
    if (!ok) console.error("webhook sync failures", out);
    return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 500 });
}
