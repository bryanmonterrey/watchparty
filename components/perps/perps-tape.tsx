"use client";

import * as React from "react";
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

/** Price grid step ~1bp of price, snapped to a clean decimal. */
function tickOf(price: number): number {
    const raw = price / 10_000;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return Math.max(mag, Math.round(raw / mag) * mag);
}

const LEVELS = 9;

type Level = { price: number; size: number; total: number };

/** Build one side of the ladder walking away from the mark. */
function ladder(mark: number, tick: number, dir: 1 | -1): Level[] {
    const out: Level[] = [];
    let total = 0;
    for (let i = 1; i <= LEVELS; i++) {
        const price = mark + dir * i * tick;
        // Seed by absolute grid slot so sizes don't reshuffle every render.
        const slot = Math.round(price / tick);
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

    React.useEffect(() => {
        let alive = true;
        setPrints([]);
        const load = async () => {
            try {
                const to = Math.floor(Date.now() / 1000);
                const from = to - 45 * 60;
                const res = await fetch(
                    `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
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

    const tick = tickOf(livePrice || 1);
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-panel2">
            <div className="flex border-b border-white/[0.06] bg-panel1">
                {(["book", "trades"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "flex-1 cursor-pointer py-2.5 text-[12px] font-bold transition-colors first:border-r first:border-white/[0.06]",
                            tab === t ? "bg-panel2 text-white" : "text-zinc-500 hover:text-white",
                        )}
                    >
                        {t === "book" ? "Order Book" : "Trades"}
                    </button>
                ))}
            </div>

            {/* Column header */}
            <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold text-zinc-600">
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
                            <div className="my-0.5 flex items-center justify-between bg-white/[0.04] px-3 py-1.5">
                                <span className="text-[11px] font-bold text-zinc-500">Spread</span>
                                <span className="text-[11px] font-bold tabular-nums text-zinc-300">
                                    {fmtPrice(tick)}
                                </span>
                                <span className="text-[11px] font-semibold tabular-nums text-zinc-500">
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
                                            "w-[34%] text-[12px] font-bold tabular-nums",
                                            up ? "text-lantern" : "text-pastelred",
                                        )}
                                    >
                                        {fmtPrice(p.price)}
                                    </span>
                                    <span className="w-[36%] text-right text-[12px] font-semibold tabular-nums text-zinc-300">
                                        {fmtSize(size)}
                                    </span>
                                    <span className="w-[30%] text-right text-[11px] font-semibold tabular-nums text-zinc-600">
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
                    "relative w-[34%] text-[12px] font-bold tabular-nums",
                    side === "ask" ? "text-pastelred" : "text-lantern",
                )}
            >
                {fmtPrice(level.price)}
            </span>
            <span className="relative w-[36%] text-right text-[12px] font-semibold tabular-nums text-zinc-300">
                {fmtSize(level.size)}
            </span>
            <span className="relative w-[30%] text-right text-[12px] font-semibold tabular-nums text-zinc-500">
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
