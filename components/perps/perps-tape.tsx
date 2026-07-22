"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { cn } from "@/lib/utils";

// Book column, Phantom-anatomy: Order Book | Trades tabs.
//
// Order Book = a price ladder centered on the live oracle mark (asks above,
// Spread row, bids below) with cumulative depth bars — Phantom's exact
// layout. Trades = Price / Size / Time rows from Pyth's 1-minute prints,
// the same feed Flash fills settle against.
//
// DATA HONESTY: prices and times are real (ER oracle + Pyth benchmarks).
// Sizes are DERIVED — Flash fills from a pool at the oracle price, so no
// public per-fill tape or resting book exists (probed api.prod.flash.trade
// 2026-07-17: trading-history endpoints return {}). Level sizes are
// deterministic pseudo-liquidity seeded by price level so the ladder is
// stable frame-to-frame. Swap to real data when we index our own fills.

type Print = { time: number; price: number };
type TapeTab = "book" | "trades";

const fmtPrice = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toPrecision(4);
};

const fmtSize = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 10) return n.toFixed(2);
    return n.toFixed(4);
};

/** Deterministic 0..1 from a seed — stable ladder sizes per price level. */
function seeded(seed: number): number {
    let t = (seed + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Smallest clean grouping step for a price (BTC → 1, SOL → 0.001). */
function baseStepOf(price: number): number {
    return 10 ** Math.floor(Math.log10(Math.max(price * 1e-4, 1e-9)));
}

/** Grouping choices, Phantom-style: base × 1 / 10 / 100 / 1000. */
const GROUP_MULTS = [1, 10, 100, 1000] as const;

const fmtStep = (n: number) =>
    n >= 1000 ? n.toLocaleString() : parseFloat(n.toPrecision(6)).toString();

const LEVELS = 9;

type Level = { price: number; size: number; total: number };

/** Build one side of the ladder walking away from the mark, snapped to the
 *  grouping grid so levels read as clean steps (64,440 / 64,450 …). */
function ladder(mark: number, tick: number, dir: 1 | -1): Level[] {
    const out: Level[] = [];
    const center = Math.round(mark / tick);
    let total = 0;
    for (let i = 1; i <= LEVELS; i++) {
        const slot = center + dir * i;
        const price = slot * tick;
        // Seed by absolute grid slot so sizes don't reshuffle every render.
        const notional = 800 + seeded(slot * 2 + (dir > 0 ? 1 : 0)) * 24_000 * (1 + i / LEVELS);
        const size = notional / mark;
        total += size;
        out.push({ price, size, total });
    }
    return out;
}

export function PerpsTape({
    pythTicker,
    symbol,
    livePrice,
}: {
    pythTicker: string;
    symbol: string;
    livePrice: number;
}) {
    const [tab, setTab] = React.useState<TapeTab>("book");
    const [prints, setPrints] = React.useState<Print[]>([]);
    // Grouping multiplier over the market's base step (default ×10 — matches
    // Phantom's default of "10" on BTC). Resets when the market changes.
    const [groupMult, setGroupMult] = React.useState<number>(10);
    React.useEffect(() => setGroupMult(10), [pythTicker]);

    React.useEffect(() => {
        let alive = true;
        setPrints([]);
        const load = async () => {
            try {
                const to = Math.floor(Date.now() / 1000);
                const from = to - 45 * 60;
                const res = await fetch(
                    `/api/pyth-udf/history` +
                    `?symbol=${encodeURIComponent(pythTicker)}&resolution=1&from=${from}&to=${to}`,
                );
                const d = (await res.json()) as { s: string; t: number[]; c: number[] };
                if (!alive || d.s !== "ok") return;
                setPrints(d.t.map((t, i) => ({ time: t * 1000, price: d.c[i] })).reverse());
            } catch {
                /* keep the last tape */
            }
        };
        load();
        const timer = setInterval(load, 15_000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [pythTicker]);

    const tick = baseStepOf(livePrice || 1) * groupMult;
    const asks = React.useMemo(
        () => (livePrice ? ladder(livePrice, tick, 1).reverse() : []),
        [livePrice, tick],
    );
    const bids = React.useMemo(
        () => (livePrice ? ladder(livePrice, tick, -1) : []),
        [livePrice, tick],
    );
    const maxTotal = Math.max(
        asks[0]?.total ?? 0,
        bids[bids.length - 1]?.total ?? 0,
    ) || 1;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/5 bg-panel2">
            <div className="flex">
                {(["book", "trades"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "flex-1 cursor-pointer py-2.5 text-base font-bold transition-colors",
                            tab === t ? "text-white" : "bg-panel1 text-zinc-500 hover:text-white",
                        )}
                    >
                        {t === "book" ? "Order Book" : "Trades"}
                    </button>
                ))}
            </div>

            {/* Column header */}
            <div className="flex items-center justify-between px-3 pb-1 pt-2 text-sm font-semibold text-zinc-600">
                <span className="w-[34%]">Price</span>
                <span className="w-[36%] text-right">Size ({symbol})</span>
                <span className="w-[30%] text-right">{tab === "book" ? `Total (${symbol})` : "Time"}</span>
            </div>

            {tab === "book" ? (
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto [scrollbar-width:none]">
                    {livePrice === 0 ? (
                        <BookSkeleton />
                    ) : (
                        <>
                            {asks.map((l) => (
                                <LadderRow key={l.price} level={l} maxTotal={maxTotal} side="ask" />
                            ))}
                            <div className="my-0.5 flex items-center justify-between bg-white/[0.04] px-3 py-1">
                                <span className="text-sm font-bold text-zinc-500">Spread</span>
                                <GooDropdown
                                    align="end"
                                    side="bottom"
                                    width={140}
                                    gap={8}
                                    triggerAriaLabel="Group prices by"
                                    triggerClassName="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold tabular-nums text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                                    trigger={
                                        <>
                                            {fmtStep(tick)}
                                            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                                        </>
                                    }
                                    items={GROUP_MULTS.map((m) => {
                                        const step = baseStepOf(livePrice || 1) * m;
                                        return {
                                            key: String(m),
                                            onClick: () => setGroupMult(m),
                                            className: cn(
                                                "rounded-full px-4 cursor-pointer text-sm font-bold tabular-nums hover:bg-white/5",
                                                m === groupMult ? "text-white" : "text-zinc-400",
                                            ),
                                            label: <>{fmtStep(step)}</>,
                                        };
                                    })}
                                />
                                <span className="text-sm font-semibold tabular-nums text-zinc-500">
                                    {((tick / livePrice) * 100).toFixed(3)}%
                                </span>
                            </div>
                            {bids.map((l) => (
                                <LadderRow key={l.price} level={l} maxTotal={maxTotal} side="bid" />
                            ))}
                        </>
                    )}
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
                    {prints.length === 0 ? (
                        <BookSkeleton />
                    ) : (
                        prints.map((p, i) => {
                            const prev = prints[i + 1]?.price;
                            const up = prev === undefined || p.price >= prev;
                            // Same seeded pseudo-size, keyed by the minute.
                            const size = (400 + seeded(Math.floor(p.time / 60_000)) * 18_000) / p.price;
                            return (
                                <div key={p.time} className="flex items-center justify-between px-3 py-[4.5px]">
                                    <span
                                        className={cn(
                                            "w-[34%] text-sm font-bold tabular-nums",
                                            up ? "text-lantern" : "text-pastelred",
                                        )}
                                    >
                                        {fmtPrice(p.price)}
                                    </span>
                                    <span className="w-[36%] text-right text-sm font-semibold tabular-nums text-zinc-300">
                                        {fmtSize(size)}
                                    </span>
                                    <span className="w-[30%] text-right text-sm font-semibold tabular-nums text-zinc-600">
                                        {new Date(p.time).toLocaleTimeString(undefined, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit",
                                            hour12: false,
                                        })}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

function LadderRow({ level, maxTotal, side }: { level: Level; maxTotal: number; side: "ask" | "bid" }) {
    const pct = Math.min(100, (level.total / maxTotal) * 100);
    return (
        <div className="relative flex items-center justify-between px-3 py-[3.5px]">
            {/* Cumulative depth bar, anchored left like Phantom's */}
            <div
                className={cn(
                    "absolute inset-y-0 left-0 rounded-r-sm opacity-[0.14]",
                    side === "ask" ? "bg-pastelred" : "bg-lantern",
                )}
                style={{ width: `${pct}%` }}
            />
            <span
                className={cn(
                    "relative w-[34%] text-sm font-bold tabular-nums",
                    side === "ask" ? "text-pastelred" : "text-lantern",
                )}
            >
                {fmtPrice(level.price)}
            </span>
            <span className="relative w-[36%] text-right text-sm font-semibold tabular-nums text-zinc-300">
                {fmtSize(level.size)}
            </span>
            <span className="relative w-[30%] text-right text-sm font-semibold tabular-nums text-zinc-500">
                {fmtSize(level.total)}
            </span>
        </div>
    );
}

function BookSkeleton() {
    return (
        <>
            {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="mx-3 my-2 h-3.5 overflow-hidden rounded-full">
                    <div className="size-full shimmer-skeleton" />
                </div>
            ))}
        </>
    );
}
