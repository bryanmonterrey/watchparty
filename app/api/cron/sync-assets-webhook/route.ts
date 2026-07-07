// Daily sync of the Helius wallet-assets webhook address list — picks up
// users who linked a wallet since the last run so their deposits get the
// instant cache-bust + realtime nudge too. Secret-guarded like the other
// crons; safe to run any time (idempotent PUT keyed on webhook URL).
import { NextRequest, NextResponse } from "next/server";
import { syncAssetsWebhook } from "@/lib/wallet/assets-webhook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await syncAssetsWebhook();
        return NextResponse.json({ ok: true, ...result });
    } catch (e) {
        console.error("sync-assets-webhook failed", e);
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "unknown" },
            { status: 500 },
        );
    }
}
