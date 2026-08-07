"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "motion/react";
import { Squircle, type SquircleCorners } from "@/components/ui/squircle";
import { StarMorphIcon } from "@/components/ai/star-morph-icon";
import { useAskOverlay } from "@/hooks/use-ask-overlay";

// The dock's AI button and the surface it opens (docs/TODO.md's "docked panel
// anchored above the button rather than a route").
//
// Rendered inside HomeActionDock's SLOT, which is the `relative` box the docked
// panel positions against — this component deliberately adds no positioning
// context of its own, so the panel hangs off the button's own corner. The
// overlay doesn't use that anchor at all; it portals to the body.
//
// Chrome (className/radius/glow) is passed in rather than restated here: the
// dock owns how its buttons look, and the AI one must not be able to drift from
// its two neighbours.
//
// This file stays deliberately thin. It holds the two bits of state the
// keyboard and click-away handlers need (`open`, `expanded`) and nothing else —
// everything that costs bytes (AI SDK, prompt-kit, markdown, shiki) lives
// behind the lazy boundary below.

// ssr: false, not a bare `await import()` — per the memory
// `worker-bundle-size-ceiling`, a lazy import alone still ships the code in the
// worker bundle; only ssr:false actually splits it out.
const AskSurface = dynamic(() => import("@/components/ai/ask-surface"), { ssr: false });

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

    // Overlay mode lives in a store, not local state, because the app header
    // has to know about it — it suppresses its scroll backdrop while a
    // full-bleed overlay is up (see app-header2.tsx). The header is an ancestor
    // rendered by (app)/layout.tsx, so there's no shared provider to thread it
    // through. Same reason use-clips-overlay exists.
    const expanded = useAskOverlay((s) => s.open);
    const expand = useAskOverlay((s) => s.onOpen);
    const collapse = useAskOverlay((s) => s.onClose);
    const setExpanded = (next: boolean) => (next ? expand() : collapse());

    // Navigating away unmounts the dock without anything calling close(), and a
    // store left `true` would suppress the header's backdrop on every page from
    // then on.
    useEffect(() => collapse, [collapse]);

    // Escape and click-away, both scoped to while it's open so a closed panel
    // costs nothing in listeners.
    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // Escape unwinds one level at a time: overlay → docked → closed.
            // `collapse` rather than the setExpanded wrapper — it's the store's
            // own action, so it's referentially stable and can be a real dep.
            if (expanded) collapse();
            else setOpen(false);
        };

        const onPointer = (e: PointerEvent) => {
            // The overlay has its own backdrop, which is a better click-away
            // than this one — running both would race over the same press.
            if (expanded) return;
            const target = e.target as Node | null;
            if (!target) return;
            // The button toggles itself; letting the away-handler also see the
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
    }, [open, expanded, collapse]);

    const close = () => {
        setOpen(false);
        // Reset the mode too, so reopening always lands on the docked panel
        // rather than silently restoring a fullscreen overlay.
        collapse();
    };

    return (
        <>
            <Squircle asChild radius={radius} shadow={glow}>
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => (open ? close() : setOpen(true))}
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

            {/* AskSurface is the direct child, not a wrapper — AnimatePresence
                tracks its own children, and a plain <div> in between would
                swallow the surface's exit animation. */}
            <AnimatePresence>
                {open && (
                    <AskSurface
                        key="ask-surface"
                        expanded={expanded}
                        onExpandedChange={setExpanded}
                        onClose={close}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
