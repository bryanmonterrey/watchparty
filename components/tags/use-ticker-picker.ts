"use client";

// The `$` ticker dropdown for the composer.
//
// Typing `$` then a character opens a list of real coins; choosing one records a
// REFERENCE and rewrites the typed text to the canonical `$SYMBOL`. Nothing is
// parsed back out of the prose afterwards — see db/schema/content/post-tag for
// why the relationship is stored rather than matched at read time.
//
// A hook rather than a component because the composer owns its own textarea,
// its own submit, and its own layout; three composers exist and none of them
// should have to adopt a foreign input to gain tagging.

import * as React from "react";
import { trpc } from "@/lib/trpc/client";

export interface PickedTag {
    network: string;
    tokenAddress: string;
    symbol: string;
    tokenId?: string | null;
}

/**
 * The `$…` the caret is sitting in, if any.
 *
 * Only the token being TYPED counts — a `$WIF` earlier in the post is already
 * decided and must not re-open the menu when the author edits a later word.
 * Returns the query without the `$`, plus where it starts, so a selection can
 * replace exactly those characters.
 */
export function activeTickerQuery(text: string, caret: number): { q: string; start: number } | null {
    const upto = text.slice(0, caret);
    const dollar = upto.lastIndexOf("$");
    if (dollar === -1) return null;
    // `$` has to open a word, matching the extractor: `US$5` is not a tag.
    const before = dollar > 0 ? upto[dollar - 1] : " ";
    if (/[\w$]/.test(before)) return null;
    const q = upto.slice(dollar + 1);
    // Whitespace closes it, and the dropdown only opens once there is at least
    // one character to search on — a bare `$` would list the entire board.
    if (!q.length || /\s/.test(q)) return null;
    if (!/^[A-Za-z0-9]{1,16}$/.test(q)) return null;
    return { q, start: dollar };
}

export function useTickerPicker(text: string, caret: number) {
    const active = React.useMemo(() => activeTickerQuery(text, caret), [text, caret]);

    const { data: results = [], isFetching } = trpc.tags.search.useQuery(
        { q: active?.q ?? "" },
        {
            enabled: !!active,
            // The query is the prefix the author is typing, so results are
            // stable per keystroke and worth holding briefly.
            staleTime: 60_000,
            placeholderData: (prev) => prev,
        },
    );

    const [highlight, setHighlight] = React.useState(0);
    React.useEffect(() => setHighlight(0), [active?.q]);

    /**
     * Apply a choice: rewrite the `$partial` the author typed into the coin's
     * canonical `$SYMBOL`, and hand back the reference to store.
     *
     * Returns the new text and where the caret should land, because the caller
     * owns the textarea — a hook that reached in and set it would fight React's
     * controlled value.
     */
    const choose = React.useCallback(
        (hit: { symbol: string; network: string; tokenAddress: string; tokenId?: string | null }) => {
            if (!active) return null;
            const symbol = hit.symbol.replace(/^\$/, "");
            const head = text.slice(0, active.start);
            const tail = text.slice(caret);
            // Trailing space so the author keeps typing a sentence rather than
            // immediately re-opening the menu on the next character.
            const inserted = `$${symbol} `;
            return {
                text: `${head}${inserted}${tail}`,
                caret: active.start + inserted.length,
                tag: {
                    network: hit.network,
                    tokenAddress: hit.tokenAddress,
                    symbol,
                    tokenId: hit.tokenId ?? null,
                } satisfies PickedTag,
            };
        },
        [active, text, caret],
    );

    return {
        /** Null when the caret isn't in a `$…` token. */
        active,
        open: !!active && results.length > 0,
        results,
        isFetching,
        highlight,
        setHighlight,
        choose,
    };
}

/**
 * Keep only the tags whose `$SYMBOL` still appears in the text.
 *
 * The author can delete a ticker after picking it, and a post that tags a coin
 * it no longer mentions would put an avatar on that coin's chart for nothing.
 * Called at submit, so the stored references always match what was published.
 */
export function reconcileTags(text: string, picked: readonly PickedTag[]): PickedTag[] {
    const lower = text.toLowerCase();
    return picked.filter((t) => lower.includes(`$${t.symbol.toLowerCase()}`));
}
