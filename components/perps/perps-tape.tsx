"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Oracle tape — Flash is pool-based (every fill settles at the Pyth oracle
// price; there is no orderbook to show), so the terminal's book column shows
// the oracle feed itself: the live ER mark on top, then 1-minute Pyth
// benchmark prints. Same source the chart and fills settle against.

type Print = { time: number; price: number };

const fmt = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toPrecision(4);
};

export function PerpsTape({ pythTicker, livePrice }: { pythTicker: string; livePrice: number }) {
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

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10">
            <div className="flex items-center justify-between px-3 pb-2 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">Oracle tape</p>
                <span className="text-[10px] font-extrabold text-zinc-700">PYTH · 1M</span>
            </div>
            <div className="flex items-baseline justify-between bg-white/[0.03] px-3 py-2">
                <span className="text-[11px] font-bold text-zinc-500">Mark</span>
                <span className="text-[14px] font-extrabold tabular-nums text-white">${fmt(livePrice)}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
                {prints.length === 0
                    ? Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="mx-3 my-2 h-3.5 overflow-hidden rounded-full">
                            <div className="size-full shimmer-skeleton" />
                        </div>
                    ))
                    : prints.map((p, i) => {
                        const prev = prints[i + 1]?.price;
                        const dir = prev === undefined || p.price === prev ? 0 : p.price > prev ? 1 : -1;
                        return (
                            <div key={p.time} className="flex items-center justify-between px-3 py-[5px]">
                                <span className="text-[11px] font-semibold tabular-nums text-zinc-600">
                                    {new Date(p.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span
                                    className={cn(
                                        "text-[12px] font-bold tabular-nums",
                                        dir > 0 ? "text-lantern" : dir < 0 ? "text-pastelred" : "text-zinc-400",
                                    )}
                                >
                                    {fmt(p.price)}
                                </span>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}
