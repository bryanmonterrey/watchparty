"use client";

import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { compactCount } from "@/lib/utils";

// $cashtag autocomplete, modelled on X's ticker dropdown.
//
// ANATOMY, from the reference:
//   • one dark panel under the caret, its own rounded box, sitting over the
//     composer rather than pushing it around
//   • per row: a round token mark, the coin's NAME in bold, and the price
//     right-aligned on the same line
//   • a second, quieter line: TICKER · market cap, with the 24h change
//     right-aligned under the price and coloured by direction
//   • the active row carries a lighter fill — it's keyboard-navigable, and the
//     first row is selected by default so Enter takes the obvious answer
//
// Adapted where the domains differ: X shows an exchange (NASDAQ, ARCA) because
// its tickers are equities. Ours are coins, so that slot carries the market cap
// and a draft/live marker instead — inventing an exchange column would be
// copying the reference rather than using it.

export interface TickerHit {
    id: string;
    ticker: string;
    name: string;
    imageUrl: string | null;
    tokenAddress: string | null;
    priceUsd: number | null;
    priceChange24h: number | null;
    marketCapUsd: number | null;
    status: string | null;
}

/**
 * Finds an active `$cashtag` at the caret.
 *
 * Returns null unless there's a `$` followed by AT LEAST ONE character before
 * the caret — a bare `$` opens nothing, so typing a dollar amount mid-sentence
 * doesn't throw a menu in your face.
 *
 * The `$` must also start a word (line start or whitespace before it), so "US$5"
 * and "a$b" don't trigger.
 */
export function findCashtagAtCaret(text: string, caret: number): { query: string; start: number; end: number } | null {
    const upto = text.slice(0, caret);
    const match = /(^|\s)\$([A-Za-z0-9_]+)$/.exec(upto);
    if (!match) return null;
    const query = match[2];
    return { query, start: caret - query.length - 1, end: caret };
}

function fmtPrice(v: number | null) {
    if (v == null) return null;
    if (v >= 1) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    // Sub-dollar coins need the small digits or every row reads $0.00.
    return `$${v.toPrecision(3)}`;
}

export function CashtagAutocomplete({
    query,
    onSelect,
    onClose,
    registerKeyHandler,
}: {
    query: string;
    onSelect: (hit: TickerHit) => void;
    onClose: () => void;
    /** Lets the host textarea forward arrow/enter/escape without stealing focus. */
    registerKeyHandler?: (handler: ((e: React.KeyboardEvent) => boolean) | null) => void;
}) {
    const [active, setActive] = useState(0);

    const { data, isLoading } = trpc.trade.searchTickers.useQuery(
        { query, limit: 6 },
        { enabled: query.length > 0, staleTime: 30_000 },
    );

    const hits = useMemo(() => (data ?? []) as TickerHit[], [data]);

    // A new query means a new list; keep the highlight on the first row rather
    // than pointing at whatever index survived from the last one.
    useEffect(() => setActive(0), [query]);

    // Arrow keys and Enter belong to the TEXTAREA — the panel never takes focus,
    // because taking it would collapse the caret the whole feature depends on.
    useEffect(() => {
        if (!registerKeyHandler) return;
        registerKeyHandler((e: React.KeyboardEvent) => {
            if (!hits.length) return false;
            if (e.key === "ArrowDown") {
                setActive((i) => (i + 1) % hits.length);
                return true;
            }
            if (e.key === "ArrowUp") {
                setActive((i) => (i - 1 + hits.length) % hits.length);
                return true;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                onSelect(hits[active]);
                return true;
            }
            if (e.key === "Escape") {
                onClose();
                return true;
            }
            return false;
        });
        return () => registerKeyHandler(null);
    }, [hits, active, onSelect, onClose, registerKeyHandler]);

    if (!query) return null;
    if (!isLoading && hits.length === 0) return null;

    return (
        <div
            className="absolute left-0 top-full z-50 mt-1 w-[min(420px,100%)] overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-xl"
            // Keep the caret: a mousedown anywhere in here would blur the
            // textarea before the click lands, and the selection needs the
            // caret position to know what to replace.
            onMouseDown={(e) => e.preventDefault()}
        >
            {isLoading && hits.length === 0 ? (
                <div className="flex flex-col">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="size-10 shrink-0 rounded-full shimmer-skeleton" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-40 rounded-full shimmer-skeleton" />
                                <div className="h-3 w-24 rounded-full shimmer-skeleton" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                hits.map((hit, i) => {
                    const change = hit.priceChange24h;
                    const up = (change ?? 0) >= 0;
                    const price = fmtPrice(hit.priceUsd);
                    return (
                        <button
                            key={hit.id}
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => onSelect(hit)}
                            className={cn(
                                "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors",
                                i === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={hit.imageUrl || "/avatar.png"}
                                alt=""
                                className="size-10 shrink-0 rounded-full object-cover"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="truncate text-[15px] font-bold text-white">{hit.name}</span>
                                    {price && (
                                        <span className="shrink-0 text-[15px] font-bold tabular-nums text-white">{price}</span>
                                    )}
                                </div>
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="truncate text-[13px] font-medium text-zinc-500">
                                        ${hit.ticker}
                                        {hit.marketCapUsd != null && ` · ${compactCount(hit.marketCapUsd)}`}
                                        {hit.status === "draft" && " · draft"}
                                    </span>
                                    {change != null && (
                                        <span
                                            className={cn(
                                                "shrink-0 text-[13px] font-semibold tabular-nums",
                                                up ? "text-long" : "text-short",
                                            )}
                                        >
                                            {up ? "+" : ""}
                                            {change.toFixed(2)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })
            )}
        </div>
    );
}
