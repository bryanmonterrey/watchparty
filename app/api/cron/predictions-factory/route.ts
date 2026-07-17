// AI market factory sweep — resolves due auto-resolvable prediction markets
// deterministically (Pyth benchmarks / platform token prices) and tops the
// board back up with Claude-generated markets when it runs thin. Hourly.
// Generation degrades gracefully without ANTHROPIC_API_KEY; resolution
// always runs.
import { NextRequest, NextResponse } from "next/server";
import { runFactory } from "@/lib/predictions/factory";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const result = await runFactory();
        return NextResponse.json(result);
    } catch (err) {
        console.error("predictions factory failed:", err);
        return NextResponse.json({ error: "factory failed" }, { status: 500 });
    }
}
