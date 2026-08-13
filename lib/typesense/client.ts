import Typesense from "typesense";

export const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.TYPESENSE_HOST ?? "localhost",
        port: Number(process.env.TYPESENSE_PORT ?? 8108),
        protocol: (process.env.TYPESENSE_PROTOCOL ?? "http") as "http" | "https",
    }],
    apiKey: process.env.TYPESENSE_API_KEY ?? "xyz",
    connectionTimeoutSeconds: 5,
});

/**
 * Is search wired up at all?
 *
 * `localhost` is the fallback baked into the client above, so it means "nobody
 * set TYPESENSE_HOST" rather than a real local cluster — treating it as
 * configured is how a production Worker ends up dialling itself.
 */
export function typesenseConfigured(): boolean {
    const host = process.env.TYPESENSE_HOST?.trim();
    return !!host && host !== "localhost";
}

// ── Circuit breaker ─────────────────────────────────────────────────────────
//
// Configured is not the same as REACHABLE, and on 2026-08-13 production was
// the difference: TYPESENSE_HOST pointed at
// pnybcdrsuh24awk7p-1.a2.typesense.net, which is NXDOMAIN — the cluster was
// deleted, so the name does not resolve at all.
//
// An env check cannot see that. Without a breaker every call still pays a DNS
// failure, and `upsertPost`/`upsertToken`/`upsertUser` sit on the post, video
// and token WRITE paths — so every publish in the app was paying for lookups
// against a host that cannot exist, to feed an index nothing can read.
//
// Deliberately a short mute rather than a permanent kill: a cluster that comes
// back (or a DNS blip) heals on its own within minutes, and a permanent
// disable would need a deploy to undo. Per-isolate state, which is the right
// grain here — a cold isolate re-testing once is the probe that notices
// recovery.
const TRIP_AFTER = 3;
const MUTE_MS = 5 * 60 * 1000;

let failures = 0;
let mutedUntil = 0;

/** Configured, and not currently muted by the breaker. */
export function typesenseReady(): boolean {
    return typesenseConfigured() && Date.now() >= mutedUntil;
}

export function noteTypesenseOk(): void {
    failures = 0;
    mutedUntil = 0;
}

export function noteTypesenseFailure(err: unknown): void {
    failures += 1;
    if (failures >= TRIP_AFTER && Date.now() >= mutedUntil) {
        mutedUntil = Date.now() + MUTE_MS;
        console.warn(
            `[typesense] ${failures} consecutive failures — muting for ${MUTE_MS / 1000}s:`,
            err instanceof Error ? err.message : err,
        );
    }
}
