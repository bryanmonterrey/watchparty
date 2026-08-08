import "server-only";
import { redis } from "@/lib/cache";

// Per-method accounting for /api/rpc, so "what is burning the Helius quota" is
// a number instead of a guess.
//
// Written because that question came up after the key hit "max usage reached"
// twice, and the honest answer was that nobody knew — the proxy is
// browser-facing, uncapped, and unattributed, so any theory about which caller
// is responsible was speculation. Cheap counters beat a good argument.
//
// What makes this useful rather than decorative is the OUTCOME dimension. The
// proxy already caches (see CACHEABLE_METHODS), so total requests is the wrong
// number — only `miss` and `bypass` actually reach Helius and cost anything.
// A method with 100k hits and 200 misses is not a problem; a method with 5k
// bypasses is.

/** Cache outcome, mirroring the `x-rpc-cache` header the proxy already sets. */
export type RpcOutcome = "hit" | "miss" | "bypass" | "skip" | "error";

/** Only these cost upstream quota. `hit` is served from Redis. */
const BILLED: RpcOutcome[] = ["miss", "bypass", "skip", "error"];

const KEY_PREFIX = "rpc:usage:";
// Eight days: enough to compare this week against last, short enough that the
// hash never becomes something anyone has to think about.
const RETENTION_SECONDS = 8 * 24 * 60 * 60;

function dayKey(now = new Date()): string {
    return `${KEY_PREFIX}${now.toISOString().slice(0, 10)}`;
}

/**
 * Records one proxied call. Never throws and never blocks the response — call
 * it from `after()` so the counter runs once the reply is already on its way.
 *
 * A metrics write must not be able to break the thing it measures: if Redis is
 * down, the proxy still proxies and we simply lose the count.
 */
export async function recordRpcCall(method: string, outcome: RpcOutcome): Promise<void> {
    try {
        const key = dayKey();
        // Two fields per call: the outcome breakdown, and a rolled-up "billed"
        // tally so the expensive total doesn't have to be recomputed by summing
        // outcomes on the read side.
        const p = redis.pipeline();
        p.hincrby(key, `${method}:${outcome}`, 1);
        if (BILLED.includes(outcome)) p.hincrby(key, `${method}:billed`, 1);
        p.expire(key, RETENTION_SECONDS);
        await p.exec();
    } catch {
        // Deliberately silent. This is instrumentation.
    }
}

export type RpcUsageRow = {
    method: string;
    billed: number;
    hit: number;
    miss: number;
    bypass: number;
    skip: number;
    error: number;
};

/** One day's breakdown, heaviest upstream consumer first. */
export async function readRpcUsage(day?: string): Promise<{
    day: string;
    totalBilled: number;
    totalHits: number;
    rows: RpcUsageRow[];
}> {
    const key = day ? `${KEY_PREFIX}${day}` : dayKey();
    let raw: Record<string, string | number> | null = null;
    try {
        raw = await redis.hgetall<Record<string, string | number>>(key);
    } catch {
        raw = null;
    }

    const byMethod = new Map<string, RpcUsageRow>();
    for (const [field, value] of Object.entries(raw ?? {})) {
        // Methods never contain ':', so splitting on the LAST one is safe and
        // survives any future field that does.
        const idx = field.lastIndexOf(":");
        if (idx < 1) continue;
        const method = field.slice(0, idx);
        const bucket = field.slice(idx + 1) as keyof RpcUsageRow;
        const row =
            byMethod.get(method) ??
            { method, billed: 0, hit: 0, miss: 0, bypass: 0, skip: 0, error: 0 };
        if (bucket in row && bucket !== "method") {
            (row[bucket] as number) = Number(value) || 0;
        }
        byMethod.set(method, row);
    }

    const rows = [...byMethod.values()].sort((a, b) => b.billed - a.billed);
    return {
        day: key.slice(KEY_PREFIX.length),
        totalBilled: rows.reduce((n, r) => n + r.billed, 0),
        totalHits: rows.reduce((n, r) => n + r.hit, 0),
        rows,
    };
}
