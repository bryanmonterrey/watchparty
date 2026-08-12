// Receiver for the Mobula trade socket held by the `Tape` Durable Object
// (realtime/src/tape.ts). Tape POSTs batches here; this maps them onto the
// SAME `recordSwaps` path the Helius webhook feeds, so the tape has one writer
// and one shape no matter which provider delivered it.
//
// Not a public webhook: the only caller is our own DO, authenticated with the
// shared REALTIME_SECRET. Mobula never calls this.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { coinTrades } from "@/db/schema/content/coin-trades";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One trade as `fast-trade` emits it. Only the fields we persist. */
type MobulaTrade = {
    hash?: string;
    blockchain?: string;
    token_address?: string;
    tokenAddress?: string;
    pair?: string;
    pair_address?: string;
    date?: number | string;
    timestamp?: number;
    sender?: string;
    trader?: string;
    type?: string;
    side?: string;
    token_amount?: number;
    amount?: number;
    token_amount_usd?: number;
    amount_usd?: number;
};

const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

export async function POST(req: NextRequest) {
    if (req.headers.get("authorization") !== process.env.REALTIME_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let trades: MobulaTrade[] = [];
    try {
        const body = (await req.json()) as { trades?: MobulaTrade[] };
        trades = Array.isArray(body.trades) ? body.trades : [];
    } catch {
        return NextResponse.json({ ok: true, wrote: 0 });
    }
    if (!trades.length) return NextResponse.json({ ok: true, wrote: 0 });

    // ACKNOWLEDGE FIRST, same rule as the Helius receiver: nothing billable
    // happens on the caller's clock. Tape re-queues on a non-200 and Mobula
    // bills by the minute, so a slow response here turns a database hiccup into
    // a growing in-memory backlog inside the DO.
    after(() => persist(trades));
    return NextResponse.json({ ok: true, accepted: trades.length });
}

async function persist(trades: MobulaTrade[]): Promise<void> {
    const rows = trades
        .map((t) => {
            const signature = t.hash;
            const tokenAddress = t.token_address ?? t.tokenAddress;
            const trader = t.sender ?? t.trader;
            if (!signature || !tokenAddress || !trader) return null;

            // Mobula dates are MILLISECONDS; `coin_trades.ts` is unix SECONDS.
            // Getting this backwards writes timestamps 1000x in the future,
            // which every time-windowed query then silently excludes — the tape
            // would look empty rather than wrong.
            const raw = typeof t.date === "string" ? Date.parse(t.date) : (t.date ?? t.timestamp ?? Date.now());
            const ts = Math.floor((raw > 1e12 ? raw : raw * 1000) / 1000);

            const kind = (t.type ?? t.side ?? "").toLowerCase();
            return {
                network: t.blockchain ?? "solana",
                poolAddress: t.pair ?? t.pair_address ?? tokenAddress,
                tokenAddress,
                signature,
                ts,
                trader,
                side: kind === "sell" ? "sell" : "buy",
                amountToken: num(t.token_amount ?? t.amount),
                amountUsd: num(t.token_amount_usd ?? t.amount_usd),
            };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

    if (!rows.length) return;

    try {
        // `signature` is the natural dedupe key and the socket can redeliver on
        // reconnect, so conflicts are expected rather than exceptional.
        await db.insert(coinTrades).values(rows).onConflictDoNothing();
    } catch (err) {
        console.error("[mobula-trades] insert failed:", err instanceof Error ? err.message : err);
    }
}
