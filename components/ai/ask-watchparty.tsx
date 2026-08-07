"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "motion/react";
import { Squircle, type SquircleCorners } from "@/components/ui/squircle";
import { StarMorphIcon } from "@/components/ai/star-morph-icon";

// The dock's AI button and the panel it opens (docs/TODO.md's "docked panel
// anchored above the button rather than a route").
//
// Rendered inside HomeActionDock's SLOT, which is the `relative` box the panel
// positions against — this component deliberately adds no positioning context
// of its own, so the panel hangs off the button's own corner.
//
// Chrome (className/radius/glow) is passed in rather than restated here: the
// dock owns how its buttons look, and the AI one must not be able to drift from
// its two neighbours.

// ssr: false, not a bare `await import()` — per the memory
// `worker-bundle-size-ceiling`, a lazy import alone still ships the code in the
// worker bundle; only ssr:false actually splits it out. Nothing in the panel
// (thread UI, session read, streaming client) loads until the first press.
const AskPanel = dynamic(() => import("@/components/ai/ask-panel"), { ssr: false });

export function AskWatchparty({
    className,
    radius,
    glow,
}: {
    className: string;
    radius: number | SquircleCorners;
    glow?: { offsetX: number; offsetY: number; blur: number; spread: number; color: string; opacity: number };
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Escape and click-away, both scoped to while it's open so a closed panel
    // costs nothing in listeners.
    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        const onPointer = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            // The button toggles itself — letting the away-handler also see the
            // press would close and reopen in the same tick.
            if (buttonRef.current?.contains(target)) return;
            if (target instanceof Element && target.closest("[data-ask-panel]")) return;
            setOpen(false);
        };

        document.addEventListener("keydown", onKey);
        document.addEventListener("pointerdown", onPointer);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerdown", onPointer);
        };
    }, [open]);

    return (
        <>
            <Squircle asChild radius={radius} shadow={glow}>
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-label={open ? "close ask watchparty" : "ask ai"}
                    aria-expanded={open}
                    className={className}
                >
                    {/* The star strokes itself peach rather than riding on
                        currentColor like its two neighbours, so it keeps the
                        brand colour through the button's zinc-400 → white
                        hover — this is the one branded action in the dock. */}
                    <StarMorphIcon open={open} className="size-6.5" />
                </button>
            </Squircle>

            {/* AskPanel is the direct child, not a wrapper — AnimatePresence
                tracks its own children, and a plain <div> in between would
                swallow the panel's exit animation. */}
            <AnimatePresence>{open && <AskPanel key="ask-panel" onClose={() => setOpen(false)} />}</AnimatePresence>
        </>
    );
}
