"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A number that pops its digits in when it changes — transitions.dev
 * number-pop-in (.claude/skills/transitions-dev/02-number-pop-in.md). CSS lives
 * in globals.css; this owns the replay.
 *
 * Wrap any value that can change under the user: view and engagement counts,
 * the wallet balance, a token's price. Pass the ALREADY-FORMATTED string —
 * "12.3K", "$1,204.55" — since the animation is per character and the commas,
 * dollar sign and suffix should ride in with the digits.
 *
 * Two things are deliberate:
 *
 *   · It does not fire on mount. The replay is gated behind a first-render
 *     ref, because a token list mounting twenty rows would pop twenty numbers
 *     at once, and a page load is not an update.
 *   · The replay is remove-class → read offsetHeight → re-add. That read is a
 *     forced reflow and it is load-bearing: without it the browser coalesces
 *     the class removal and re-addition into one style recalculation and the
 *     animation never restarts.
 */
export function PopNumber({
    value,
    className,
}: {
    /** Formatted for display — every character animates, not just digits. */
    value: string | number;
    className?: string;
}) {
    const ref = React.useRef<HTMLSpanElement>(null);
    const isFirstRender = React.useRef(true);
    const text = String(value);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        el.classList.remove("is-animating");
        void el.offsetHeight;
        el.classList.add("is-animating");
    }, [text]);

    const chars = [...text];
    return (
        <span ref={ref} className={cn("t-digit-group", className)}>
            {chars.map((ch, i) => (
                <span
                    key={i}
                    className="t-digit"
                    // The last two characters ride 1x / 2x the stagger behind
                    // the rest, which is what keeps decimals feeling alive
                    // instead of arriving as one block.
                    data-stagger={
                        i === chars.length - 2 ? "1" : i === chars.length - 1 ? "2" : undefined
                    }
                >
                    {/* A collapsed space would break the per-character layout. */}
                    {ch === " " ? " " : ch}
                </span>
            ))}
        </span>
    );
}
