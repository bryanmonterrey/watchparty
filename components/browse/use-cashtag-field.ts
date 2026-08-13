"use client";

// Tagging for any field that isn't the post composer.
//
// `CashtagAutocomplete` is the menu, and post-composer already drives it — but
// it does so with ~40 lines of caret tracking, key routing and caret restoration
// woven through a 900-line component. Stream titles, video titles and
// descriptions, and spaces all want the same behaviour and none of them should
// have to copy that.
//
// So this is the driving, extracted: hand it the value and a setter, spread the
// returned props onto the input, render the menu when `open`. Roughly:
//
//   const tagging = useCashtagField(title, setTitle);
//   <input {...tagging.inputProps} ref={tagging.ref} />
//   {tagging.open && <CashtagAutocomplete query={tagging.query} onSelect={tagging.select} … />}
//   // at submit: tagging.tagsIn(title)
//
// It works on <input> as well as <textarea> — a stream title is one line, and
// the caret APIs are identical on both.

import * as React from "react";
import { findCashtagAtCaret, type TickerHit } from "@/components/browse/cashtag-autocomplete";

export interface PickedTag {
    network: string;
    tokenAddress: string;
    symbol: string;
    tokenId?: string | null;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

export function useCashtagField(value: string, setValue: (next: string) => void) {
    const ref = React.useRef<Field>(null);
    const [hit, setHit] = React.useState<ReturnType<typeof findCashtagAtCaret>>(null);
    const [picked, setPicked] = React.useState<PickedTag[]>([]);
    // The menu owns arrows/Enter/Escape while open. It never takes focus —
    // focus would collapse the caret the replacement depends on — so it hands
    // back a handler and the field routes keys into it.
    const keyHandler = React.useRef<((e: React.KeyboardEvent) => boolean) | null>(null);

    const sync = React.useCallback((el: Field | null) => {
        if (!el) return;
        setHit(findCashtagAtCaret(el.value, el.selectionStart ?? 0));
    }, []);

    const select = React.useCallback(
        (h: TickerHit) => {
            if (!hit) return;
            const before = value.slice(0, hit.start);
            const after = value.slice(hit.end);
            const inserted = `$${h.ticker.toUpperCase()}`;
            setValue(`${before}${inserted} ${after}`);
            setHit(null);

            if (h.tokenAddress) {
                const network = h.chain || "solana";
                setPicked((prev) =>
                    prev.some((t) => t.network === network && t.tokenAddress === h.tokenAddress)
                        ? prev
                        : [...prev, { network, tokenAddress: h.tokenAddress!, symbol: h.ticker.toUpperCase(), tokenId: h.id || null }],
                );
            }

            // Next frame, so React has committed the new value before the caret
            // is moved into it — setting it first puts the caret in the old text.
            requestAnimationFrame(() => {
                const el = ref.current;
                if (!el) return;
                const pos = before.length + inserted.length + 1;
                el.focus();
                el.setSelectionRange(pos, pos);
            });
        },
        [hit, value, setValue],
    );

    /**
     * The tags to SEND, given the text as published.
     *
     * Filtered rather than trusted: an author can pick a ticker and then delete
     * it, and storing that would put their avatar on a coin's chart for a post
     * that never mentions it.
     */
    const tagsIn = React.useCallback(
        (text: string) => picked.filter((t) => text.toLowerCase().includes(`$${t.symbol.toLowerCase()}`)),
        [picked],
    );

    const close = React.useCallback(() => setHit(null), []);

    return {
        ref,
        close,
        open: !!hit,
        query: hit?.query ?? "",
        select,
        keyHandler,
        tagsIn,
        picked,
        inputProps: {
            onChange: (e: React.ChangeEvent<Field>) => {
                setValue(e.target.value);
                sync(e.target);
            },
            onClick: (e: React.MouseEvent<Field>) => sync(e.currentTarget),
            onKeyUp: (e: React.KeyboardEvent<Field>) => sync(e.currentTarget),
            onKeyDown: (e: React.KeyboardEvent<Field>) => {
                if (hit && keyHandler.current?.(e)) e.preventDefault();
            },
        },
    };
}
