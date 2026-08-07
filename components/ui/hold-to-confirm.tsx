"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Hold-to-confirm, for actions that move money.
//
// Technique from Emil Kowalski's hold-to-delete
// (emilkowal.ski/ui/building-a-hold-to-delete-component): a duplicate label
// sits in an overlay clipped with `clip-path: inset(0 100% 0 0)`, and the hold
// animates the clip to zero. The fill is one compositor-friendly property, so
// nothing re-renders per frame. His timings are kept — "pressing should be slow
// to allow the user to confirm their choice, but the release can be much
// snappier": 2s linear in, 200ms ease-out back.
//
// Three things are ours, because his is a visual demo and this authorises a
// transfer:
//
//   1. A TIMER COMMITS, not the CSS. `:active` alone can't tell you the hold
//      finished, and `transitionend` also fires on the reverse transition, so
//      releasing early would confirm the very thing you just cancelled.
//   2. KEYBOARD HOLDS. Space/Enter held down runs the same path. A confirm
//      that only works with a pointer isn't a confirm for keyboard users, it's
//      a wall.
//   3. CANCEL ON DRIFT. pointerleave and pointercancel abort, so sliding off
//      mid-hold is a reliable escape hatch — that's the whole reason this
//      pattern beats a dialog: the way out requires no second decision.
//
// Reduced motion shortens nothing. The delay IS the safety mechanism, not
// decoration; only the press-scale is dropped.

const HOLD_MS = 2000;

export function HoldToConfirm({
    label,
    holdingLabel,
    onConfirm,
    duration = HOLD_MS,
    disabled = false,
    icon,
    className,
}: {
    label: string;
    /** Shown in the filling overlay. Defaults to `label`. */
    holdingLabel?: string;
    onConfirm: () => void;
    duration?: number;
    disabled?: boolean;
    icon?: React.ReactNode;
    className?: string;
}) {
    const [holding, setHolding] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Guards against a keyup that never comes (window blur mid-hold) firing a
    // stale confirm later.
    const committed = useRef(false);

    const cancel = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setHolding(false);
    }, []);

    const start = useCallback(() => {
        if (disabled || timer.current) return;
        committed.current = false;
        setHolding(true);
        timer.current = setTimeout(() => {
            timer.current = null;
            committed.current = true;
            setHolding(false);
            onConfirm();
        }, duration);
    }, [disabled, duration, onConfirm]);

    // A hold interrupted by tab-away or a lost pointer should abort, not sit
    // armed. Without this, coming back to the tab can fire the transfer.
    useEffect(() => {
        if (!holding) return;
        const abort = () => cancel();
        window.addEventListener("blur", abort);
        document.addEventListener("visibilitychange", abort);
        return () => {
            window.removeEventListener("blur", abort);
            document.removeEventListener("visibilitychange", abort);
        };
    }, [holding, cancel]);

    useEffect(() => () => cancel(), [cancel]);

    return (
        <button
            type="button"
            disabled={disabled}
            // Pointer events rather than mouse/touch: one path for both, and
            // pointercancel is the only reliable signal when the OS steals the
            // gesture (scroll takeover, notification).
            onPointerDown={start}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onKeyDown={(e) => {
                if (e.key !== " " && e.key !== "Enter") return;
                // Held keys autorepeat; only the first press should arm it.
                if (e.repeat) return;
                e.preventDefault();
                start();
            }}
            onKeyUp={(e) => {
                if (e.key !== " " && e.key !== "Enter") return;
                if (!committed.current) cancel();
            }}
            onBlur={cancel}
            aria-label={`${label} — press and hold to confirm`}
            className={cn(
                "relative isolate flex h-11 w-full cursor-pointer select-none items-center justify-center gap-2",
                "overflow-hidden rounded-full text-sm font-semibold",
                "bg-soft-gray-15 text-flexwhite transition-transform duration-150 ease-out",
                "motion-safe:active:scale-[0.97]",
                "disabled:cursor-not-allowed disabled:opacity-40",
                className,
            )}
        >
            <span className="flex items-center gap-2">
                {icon}
                {label}
            </span>

            {/* The fill. aria-hidden so the label isn't announced twice — the
                accessible name comes from aria-label above. */}
            <span
                aria-hidden="true"
                className={cn(
                    "absolute inset-0 flex items-center justify-center gap-2",
                    "bg-white text-sm font-semibold text-black",
                )}
                style={{
                    clipPath: holding ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                    transition: holding
                        ? `clip-path ${duration}ms linear`
                        : "clip-path 200ms ease-out",
                }}
            >
                {icon}
                {holdingLabel ?? label}
            </span>
        </button>
    );
}
