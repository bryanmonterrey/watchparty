"use client";

// Press-and-hold confirmation, for actions that spend money and cannot be
// undone.
//
// The board's Buy used to fire a swap on a single click with no confirmation at
// all, which on a touch target next to a scrolling list is one mis-tap away
// from an unwanted trade. A hold is the cheapest real safeguard: it costs a
// deliberate second, needs no second dialog to dismiss, and a slip cancels
// itself by releasing.
//
// The label MUST say "Hold" (callers pass it) — a button that ignores taps and
// explains nothing reads as broken, and users tap harder rather than longer.

import * as React from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/** Long enough to be deliberate, short enough not to feel stuck. */
const HOLD_MS = 700;

export function HoldButton({
    onConfirm,
    disabled,
    className,
    fillClassName,
    children,
}: {
    onConfirm: () => void;
    disabled?: boolean;
    className?: string;
    /** The sweep colour — a caller on a coloured button needs contrast against it. */
    fillClassName?: string;
    children: React.ReactNode;
}) {
    const reduced = useReducedMotion();
    const [progress, setProgress] = React.useState(0);
    const frame = React.useRef<number | null>(null);
    const startedAt = React.useRef(0);
    // Held in a ref as well as state: the rAF closure reads it, and state would
    // be stale inside a loop that outlives the render it was created in.
    const holding = React.useRef(false);

    const stop = React.useCallback(() => {
        holding.current = false;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        setProgress(0);
    }, []);

    // Release outside the button still cancels. Without this, dragging off mid
    // hold leaves the fill frozen on screen and the gesture ambiguous.
    React.useEffect(() => {
        const onUp = () => holding.current && stop();
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [stop]);

    React.useEffect(() => stop, [stop]);

    const begin = React.useCallback(() => {
        if (disabled || holding.current) return;
        holding.current = true;
        startedAt.current = performance.now();

        const tick = () => {
            if (!holding.current) return;
            const p = Math.min(1, (performance.now() - startedAt.current) / HOLD_MS);
            setProgress(p);
            if (p >= 1) {
                // Clear BEFORE firing: onConfirm often opens a wallet prompt,
                // and a live rAF loop behind it would keep repainting a button
                // the user can no longer see.
                stop();
                onConfirm();
                return;
            }
            frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
    }, [disabled, onConfirm, stop]);

    return (
        <button
            type="button"
            disabled={disabled}
            onPointerDown={begin}
            onPointerUp={stop}
            onPointerLeave={stop}
            // Keyboard gets the same gesture rather than an instant path:
            // holding Space is the equivalent deliberate act, and auto-repeat
            // is filtered so the hold starts once. Enter is excluded because
            // browsers fire it on a focused button in ways a hold cannot model.
            onKeyDown={(e) => {
                if (e.key === " " && !e.repeat) {
                    e.preventDefault();
                    begin();
                }
            }}
            onKeyUp={(e) => {
                if (e.key === " ") stop();
            }}
            onBlur={stop}
            className={cn(
                "relative inline-flex items-center justify-center overflow-hidden select-none",
                className,
            )}
        >
            {/* Resting label, on the button's own dark fill. */}
            <span className="relative">{children}</span>

            {/* The sweep, as a full SECOND COPY of the button revealed left to
                right — background and label together.

                `clip-path: inset()` rather than `scaleX`: a transform would
                squash this copy's text as it grew, and the label has to stay
                legible the whole way across. It is also not a layout property,
                so it still satisfies the rule against animating width/height.

                Two layers rather than one translucent overlay because the fill
                INVERTS the contrast — white-on-near-black at rest, black-on-
                green once filled. A single label cannot be readable on both,
                and a green wash under white text is the worse half of that
                trade at roughly 1.9:1.

                Under reduced motion there is no sweep at all, but the HOLD IS
                STILL REQUIRED: it is a safety affordance, not decoration, and
                dropping it there would hand the least motion-tolerant users the
                least protected button. */}
            {!reduced && progress > 0 ? (
                <span
                    aria-hidden
                    style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
                    className={cn(
                        "absolute inset-0 inline-flex items-center justify-center",
                        fillClassName ?? "bg-lantern text-black",
                    )}
                >
                    {children}
                </span>
            ) : null}
        </button>
    );
}
