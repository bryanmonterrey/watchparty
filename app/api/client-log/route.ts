// Client-side failures, surfaced in `wrangler tail`.
//
// The chart dies in the BROWSER — the server serves bars correctly (src=db,
// bars=24) and every library asset is 200 — but the coin page is auth-gated, so
// the failure can't be reproduced from a script, and reading it meant asking
// someone to open devtools and copy a line back. This route closes that loop:
// the component POSTs why it gave up, and it lands in the same tail as
// everything else.
//
// Deliberately tiny and deliberately unauthenticated — it must work on any
// surface, including one where auth itself is what's broken. Nothing is stored,
// nothing is trusted; it only ever reaches a log line.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX = 400;

export async function POST(req: NextRequest) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: true });
    }

    const { tag, detail } = (body ?? {}) as { tag?: unknown; detail?: unknown };
    // Truncated and stringified here rather than trusted: this endpoint is open,
    // so its output has to stay bounded and non-structural in the log.
    const safeTag = String(tag ?? "unknown").slice(0, 40).replace(/[\r\n]/g, " ");
    const safeDetail = JSON.stringify(detail ?? {}).slice(0, MAX).replace(/[\r\n]/g, " ");

    console.log(`[client:${safeTag}] ${safeDetail}`);
    return NextResponse.json({ ok: true });
}
