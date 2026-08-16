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
import { sendDiscordAlert } from "@/lib/alerts/discord";

export const dynamic = "force-dynamic";

const MAX = 400;

/**
 * Tags that also reach Discord, and an ALLOWLIST rather than a filter because
 * this route is deliberately unauthenticated.
 *
 * Anyone can POST here. Forwarding whatever arrives would hand the alerts
 * channel to the internet, so a tag only escalates if it is named here, and
 * `sendDiscordAlert` dedupes in Redis on top of that — worst case an abuser
 * gets one message per window, not a flood.
 */
const DISCORD_TAGS: Record<string, { title: string; windowSeconds: number }> = {
    "coin:no-image": { title: "Coins are rendering without a logo", windowSeconds: 3600 },
};

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

    // Escalate the allowlisted ones so they don't need someone watching a tail.
    //
    // The dedupe key carries the REASON, not the coin: "a logo 404s" and "the
    // row never had a URL" are different bugs in different systems, and each
    // wants its own alert — but one alert, not one per coin. The failure mode
    // is a whole board at once, so keying per coin would be fifty messages.
    const escalate = DISCORD_TAGS[safeTag];
    if (escalate) {
        const reason = (detail as { reason?: unknown } | null)?.reason;
        void sendDiscordAlert({
            key: `client:${safeTag}:${String(reason ?? "unknown").slice(0, 24)}`,
            title: escalate.title,
            detail: `${safeDetail}\n\nOne alert per reason per ${escalate.windowSeconds / 60}min — the line above is one example, not the only one. "missing" = the row carried no imageUrl (chase the sync that wrote it); "load-failed" = the URL is there and dead (curl the src).`,
            severity: "warn",
            windowSeconds: escalate.windowSeconds,
        });
    }

    return NextResponse.json({ ok: true });
}
