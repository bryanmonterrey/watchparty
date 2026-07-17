"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// The book column, Phantom-anatomy: Order Book | Trades tabs on top, mark
// price strip, then the feed. Flash is pool-based — every fill settles at
// the Pyth oracle price, so there is no resting book; the Order Book tab
// says so honestly and Trades shows the live oracle prints (the ER mark on
// top of 1-minute Pyth benchmark prints — the same source fills settle
// against).

type Print = { time: number; price: number };
type TapeTab = "book" | "trades";

const fmt = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toPrecision(4);
};

export function PerpsTape({ pythTicker, livePrice }: { pythTicker: string; livePrice: number }) {
    const [tab, setTab] = React.useState<TapeTab>("trades");
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-panel ring-1 ring-white/10">
            <div className="flex border-b border-white/[0.06]">
                {(["book", "trades"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "flex-1 cursor-pointer py-2.5 text-[12px] font-bold transition-colors first:border-r first:border-white/[0.06]",
                            tab === t ? "text-white" : "text-zinc-500 hover:text-white",
                        )}
                    >
                        {t === "book" ? "Order Book" : "Trades"}
                    </button>
                ))}
            </div>
            <div className="flex items-baseline justify-between bg-white/[0.03] px-3 py-2">
                <span className="text-[11px] font-bold text-zinc-500">Mark</span>
                <span className="text-[14px] font-extrabold tabular-nums text-white">${fmt(livePrice)}</span>
            </div>
            {tab === "book" ? (
                <p className="flex-1 px-4 py-4 text-[12px] font-medium leading-relaxed text-zinc-500">
                    Flash fills from a liquidity pool at the Pyth oracle price — there&apos;s no
                    resting order book. Trades shows the live oracle prints your fills settle
                    against.
                </p>
            ) : (
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
            )}
        </div>
    );
}
