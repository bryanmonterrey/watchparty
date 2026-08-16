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
    succeeded,
    className,
    fillClassName,
    successClassName,
    children,
}: {
    onConfirm: () => void;
    disabled?: boolean;
    /** Owned by the CALLER, not inferred here: only it knows whether the thing
     *  the hold started actually landed. A button that congratulated itself the
     *  moment the gesture completed would be lying about the outcome. */
    succeeded?: boolean;
    className?: string;
    /** The sweep colour — a caller on a coloured button needs contrast against it. */
    fillClassName?: string;
    /** Replaces `className` once `succeeded`, so the whole button restyles. */
    successClassName?: string;
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

    // A completed buy must not be re-triggerable by keeping a finger down.
    React.useEffect(() => {
        if (succeeded) stop();
    }, [succeeded, stop]);

    const begin = React.useCallback(() => {
        if (disabled || succeeded || holding.current) return;
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
    }, [disabled, succeeded, onConfirm, stop]);

    return (
        <button
            type="button"
            disabled={disabled || succeeded}
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
                "relative inline-flex items-center justify-center overflow-hidden select-none transition-colors",
                succeeded ? successClassName : className,
            )}
        >
            {/* The sweep, BEHIND the label and revealed left to right.
                `clip-path: inset()` rather than `scaleX`, which would squash it
                as it grew; it is also not a layout property, so the rule
                against animating width/height still holds.

                One layer, not two, because the label is legible on the base and
                on the fill alike — that is a property of the palette the caller
                passes, and it stops being true the moment a bright fill is
                used, which is why the success state restyles the whole button
                (including its text colour) rather than sweeping.

                Under reduced motion there is no sweep at all, but the HOLD IS
                STILL REQUIRED: it is a safety affordance, not decoration, and
                dropping it there would hand the least motion-tolerant users the
                least protected button. */}
            {!reduced && progress > 0 && !succeeded ? (
                <span
                    aria-hidden
                    style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
                    className={cn("absolute inset-0", fillClassName ?? "bg-white/20")}
                />
            ) : null}

            <span className="relative">{children}</span>
        </button>
    );
}
