"use client";

// The token-address pill from the coin header, lifted out of coin-detail.tsx —
// that file crossed the 1000-line guard when the swap column was reordered, and
// this is the largest piece of it that is genuinely self-contained: one button,
// its own copy state, no coin data beyond the string.

import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

/** Token-address pill beside the coin name — a small squircle chip with three
 *  faces, swapped in place by the transitions.dev text swap (exit up + blur,
 *  enter from below): resting shows the truncated address, hover swaps to
 *  "Copy" with the copy glyph, click swaps to "Copied" while a check
 *  stroke-draws in (transitions.dev success check). Touch has no hover, so
 *  the tap goes address → "Copied" directly — which is why the address is the
 *  resting face and not a hover reveal. */
export function CopyTokenAddress({ address }: { address: string }) {
    const short = `${address.slice(0, 5)}…${address.slice(-5)}`;
    const [copied, setCopied] = React.useState(false);
    const [hovered, setHovered] = React.useState(false);
    const labelRef = React.useRef<HTMLSpanElement | null>(null);
    const swapTimer = React.useRef<number | undefined>(undefined);
    const resetTimer = React.useRef<number | undefined>(undefined);

    const label = copied ? "Copied" : hovered ? "Copy" : short;

    // The skill's three-phase swap, imperative on textContent: the label has
    // to change mid-transition (after the exit, before the enter), which a
    // plain state render can't schedule. React never fights the mutation —
    // the JSX child below is the constant `short`, so reconciliation has no
    // text update to write. Re-targeting mid-swap (hover → quick click) just
    // clears the pending timer; the exit is already underway and the newest
    // label is the one that lands.
    React.useEffect(() => {
        const el = labelRef.current;
        if (!el || el.textContent === label) return;
        const dur =
            parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-swap-dur")) || 150;
        window.clearTimeout(swapTimer.current);
        el.classList.add("is-exit");
        swapTimer.current = window.setTimeout(() => {
            el.textContent = label;
            el.classList.remove("is-exit");
            el.classList.add("is-enter-start");
            void el.offsetHeight; // reflow so the enter transition plays
            el.classList.remove("is-enter-start");
        }, dur);
    }, [label]);

    React.useEffect(
        () => () => {
            window.clearTimeout(swapTimer.current);
            window.clearTimeout(resetTimer.current);
        },
        [],
    );

    return (
        <Squircle asChild radius={6}>
            <button
                type="button"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={() => {
                    void navigator.clipboard.writeText(address);
                    setCopied(true);
                    window.clearTimeout(resetTimer.current);
                    resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
                }}
                aria-label={copied ? "token address copied" : "copy token address"}
                className={cn(
                    "relative grid h-6 shrink-0 cursor-pointer place-items-center bg-soft-gray/5 px-2 text-sm font-medium transition-colors",
                    copied ? "text-long" : "text-zinc-500 hover:bg-soft-gray/10 hover:text-white",
                )}
            >
                {/* Invisible sizers, stacked in one grid cell: they pin the
                    pill to its widest face so the swap never changes its width
                    — without them every hover nudged the market-cap block and
                    the whole stat strip sideways. Two candidates (the resting
                    address; "Copied" + open icon slot) because which is wider
                    depends on the address's glyphs. */}
                <span aria-hidden className="invisible whitespace-nowrap [grid-area:1/1]">
                    {short}
                </span>
                <span aria-hidden className="invisible flex items-center whitespace-nowrap [grid-area:1/1]">
                    Copied
                    <span className="ml-1 w-3.5" />
                </span>
                {/* The live face is absolute so its transient widths (a label
                    mid-swap while the icon slot is still closing) can't size
                    the pill — it just recenters inside the reserved footprint. */}
                <span className="absolute inset-0 flex items-center justify-center">
                    <span ref={labelRef} className="t-text-swap whitespace-nowrap">
                        {short}
                    </span>
                    {/* The icon slot collapses to zero width at rest so the
                        resting face is just the address — it widens to admit
                        the copy glyph on hover and the check on copy. */}
                    <span
                        className={cn(
                            "relative inline-flex h-3.5 shrink-0 items-center justify-center transition-all duration-200 ease-out",
                            hovered || copied ? "ml-1 w-3.5" : "ml-0 w-0",
                        )}
                    >
                        <HugeiconsIcon
                            icon={Copy01Icon}
                            strokeWidth={2}
                            className={cn(
                                "absolute size-3.5 transition-all duration-200 ease-out",
                                hovered && !copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
                            )}
                        />
                        {/* Success check: always mounted, toggled via data-state
                            so the stroke-draw replays on each copy. Reverting to
                            "out" snaps it hidden, and the label swapping back
                            covers the exit. Path length ≈ 20.9 — the dasharray
                            in globals.css is sized to THIS path. */}
                        <span
                            className="t-success-check absolute"
                            data-state={copied ? "in" : "out"}
                            aria-hidden="true"
                        >
                            <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
                                <path
                                    d="M5 12.5L10 17.5L19 7"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                    </span>
                </span>
            </button>
        </Squircle>
    );
}
