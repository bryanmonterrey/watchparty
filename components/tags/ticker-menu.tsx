"use client";

// The dropdown itself — the list that appears under a `$…` being typed.
//
// Presentational on purpose: it takes results and reports a choice. The caret
// tracking, the query and the text rewrite live in `use-ticker-picker`, so a
// composer can adopt tagging without also adopting a layout.

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TickerHit {
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    network: string;
    tokenAddress: string;
    tokenId: string | null;
}

export function TickerMenu({
    results,
    highlight,
    onHighlight,
    onChoose,
    className,
}: {
    results: readonly TickerHit[];
    highlight: number;
    onHighlight: (i: number) => void;
    onChoose: (hit: TickerHit) => void;
    className?: string;
}) {
    if (!results.length) return null;

    return (
        <div
            role="listbox"
            aria-label="Tag a coin"
            className={cn(
                "absolute z-50 max-h-72 w-[min(22rem,90vw)] overflow-y-auto rounded-2xl bg-soft-gray-5 p-1 shadow-none",
                "ring-1 ring-[rgba(138,145,158,0.2)]",
                className,
            )}
        >
            {results.map((hit, i) => (
                <button
                    key={`${hit.network}:${hit.tokenAddress}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    // MOUSE DOWN, not click: the composer's textarea loses focus
                    // on mousedown, and a blur handler that closes the menu would
                    // unmount this before a click ever lands.
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onChoose(hit);
                    }}
                    onMouseEnter={() => onHighlight(i)}
                    className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                        i === highlight ? "bg-soft-gray-15" : "hover:bg-soft-gray-15/60",
                    )}
                >
                    <span className="size-7 shrink-0 overflow-hidden rounded-full bg-soft-gray-10">
                        {hit.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- coin logos come from many hosts
                            <img src={hit.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                        )}
                    </span>
                    <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-semibold text-flexwhite">${hit.symbol}</span>
                        {hit.name && (
                            <span className="truncate text-[11px] font-medium text-zinc-500">{hit.name}</span>
                        )}
                    </span>
                    {/* The chain, because the same ticker exists on several and
                        the whole point of picking is to say WHICH coin. */}
                    <span className="ml-auto shrink-0 text-[11px] font-medium uppercase text-zinc-600">
                        {hit.network}
                    </span>
                </button>
            ))}
        </div>
    );
}
