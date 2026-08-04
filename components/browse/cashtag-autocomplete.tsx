"use client";

import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn, compactCount } from "@/lib/utils";
import { ChainBadge } from "@/components/trending/chain-badge";

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
    /**
     * Which market the row belongs to. "Crypto" today for everything, because
     * every token here is one.
     *
     * TOKENIZED STOCKS get their exchange in this slot — "NYSE", "NASDAQ" —
     * which is exactly what the reference does and why this is a free-text
     * venue rather than a boolean. When those land, the only change needed is
     * the server filling this in; the row already renders it.
     */
    venue?: string | null;
    /**
     * Chain slug for the badge on the mark (see components/trending/chain-badge).
     * Solana for now — the column doesn't exist yet, so the server defaults it.
     * An equity row would carry none, and the badge simply doesn't render.
     */
    chain?: string | null;
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

// The reference shows $23.44 and $0.00000142 in the same list, so a fixed 2dp
// is not an option — a memecoin would read $0.00 next to a real price. Two
// decimals from a dollar up, three significant figures below, which is what
// produces $0.00335 and $0.00000142.
function fmtPrice(v: number | null) {
    if (v == null) return null;
    if (v >= 1) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${Number(v.toPrecision(3))}`;
}

/** 0x26f3…2e29 — how the reference tells two same-named tokens apart. */
function shortAddress(a: string) {
    return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * The vertical offset of the caret's line inside a textarea.
 *
 * The panel opens directly under the LINE being typed, not under the whole
 * field — on a multi-line draft those are very different places, and anchoring
 * to the box puts the menu nowhere near the word it's completing.
 *
 * A textarea gives no caret geometry, so the standard trick: render an
 * invisible div with the same text and the same type metrics, put a marker
 * where the caret is, and measure the marker. Copying the exact properties that
 * affect wrapping is the whole job — miss the padding or the font and the
 * mirror wraps differently from the real thing and the answer is wrong.
 */
export function caretLineOffset(el: HTMLTextAreaElement): number {
    const style = window.getComputedStyle(el);
    const mirror = document.createElement("div");

    const copy = [
        "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
        "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
        "lineHeight", "textTransform", "wordSpacing", "textIndent",
    ] as const;
    for (const p of copy) mirror.style[p as any] = style[p as any];

    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflow = "hidden";
    mirror.style.height = "auto";

    const caret = el.selectionStart ?? 0;
    mirror.textContent = el.value.slice(0, caret);

    // A zero-width marker at the caret. Textnode-only measurement would give the
    // block's height, not the current line's top.
    const marker = document.createElement("span");
    marker.textContent = "​";
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const top = marker.offsetTop;
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    document.body.removeChild(mirror);

    // Bottom of the caret's line, minus however far the textarea is scrolled.
    return top + lineHeight - el.scrollTop;
}

export function CashtagAutocomplete({
    query,
    onSelect,
    onClose,
    registerKeyHandler,
    /** Distance from the top of the positioning parent to the caret's line. */
    top = 0,
}: {
    query: string;
    onSelect: (hit: TickerHit) => void;
    onClose: () => void;
    /** Lets the host textarea forward arrow/enter/escape without stealing focus. */
    registerKeyHandler?: (handler: ((e: React.KeyboardEvent) => boolean) | null) => void;
    top?: number;
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
            style={{ top }}
            className="absolute left-0 z-50 mt-1 w-[min(460px,100%)] overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a] shadow-xl"
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
                            {/* The mark, with its chain badge tucked on the
                                bottom-right corner exactly as the reference
                                does. An equity row carries no chain, so the
                                badge simply doesn't render. */}
                            <span className="relative size-10 shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={hit.imageUrl || "/avatar.png"}
                                    alt=""
                                    className="size-10 rounded-full object-cover"
                                />
                                {hit.chain && (
                                    <ChainBadge
                                        network={hit.chain}
                                        className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-2 ring-[#0a0a0a]"
                                    />
                                )}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="truncate text-[15px] font-bold text-white">{hit.name}</span>
                                    {price && (
                                        <span className="shrink-0 text-[15px] font-bold tabular-nums text-white">{price}</span>
                                    )}
                                </div>
                                {/* TICKER · chain · market cap · contract.
                                    The address segment is the disambiguator —
                                    it's what tells two tokens sharing a name and
                                    ticker apart. No draft marker: drafts never
                                    reach this list (see trade.searchTickers). */}
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="truncate text-[13px] font-medium text-zinc-500">
                                        {[
                                            hit.ticker.toUpperCase(),
                                            hit.venue,
                                            hit.marketCapUsd != null ? compactCount(hit.marketCapUsd) : null,
                                            hit.tokenAddress ? shortAddress(hit.tokenAddress) : null,
                                        ].filter(Boolean).join(" · ")}
                                    </span>
                                    {change != null && (
                                        <span
                                            className={cn(
                                                "shrink-0 text-[13px] font-semibold tabular-nums",
                                                // Flat is neither win nor loss —
                                                // the reference greys 0% rather
                                                // than painting it green.
                                                change === 0 ? "text-zinc-400" : up ? "text-long" : "text-short",
                                            )}
                                        >
                                            {change > 0 ? "+" : ""}
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
