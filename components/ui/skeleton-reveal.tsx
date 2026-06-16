"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Skeleton → content reveal (transitions.dev). Stacks a pulsing skeleton and
// the real content in one grid cell; when `loading` flips false the skeleton
// fades/blurs out as the content fades in. If `loading` flips back true (e.g. a
// re-fetch), it snap-resets to the skeleton instantly (no reverse animation)
// and pulses again. Styles live in app/globals.css (.t-skel*).
//
// Usage:
//   <SkeletonReveal loading={isLoading} skeleton={<MySkeleton />}>
//     <MyContent />
//   </SkeletonReveal>
export interface SkeletonRevealProps {
    /** Drive from your data fetch / route change. */
    loading: boolean;
    skeleton: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    /** Pulse cycles before the reveal (CSS --pulse-count). Default 1. */
    pulseCount?: number;
}

export function SkeletonReveal({ loading, skeleton, children, className, pulseCount }: SkeletonRevealProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const skelRef = useRef<HTMLDivElement>(null);
    // Initial render class only — after mount the effect drives state via
    // classList so React re-renders never fight the imperative reset.
    const initialLoading = useRef(loading);

    useEffect(() => {
        const wrap = wrapRef.current;
        const skel = skelRef.current;
        if (!wrap || !skel) return;

        if (!loading) {
            wrap.classList.add("is-revealed");
            return;
        }
        // (Re)entering loading: drop the reveal instantly (is-resetting kills the
        // transition), force a reflow, then restart the pulse so it animates next
        // reveal.
        wrap.classList.add("is-resetting");
        wrap.classList.remove("is-revealed");
        skel.classList.remove("is-pulsing");
        void skel.offsetWidth;
        wrap.classList.remove("is-resetting");
        skel.classList.add("is-pulsing");
    }, [loading]);

    return (
        <div
            ref={wrapRef}
            className={cn("t-skel", !initialLoading.current && "is-revealed", className)}
            style={pulseCount != null ? ({ "--pulse-count": pulseCount } as React.CSSProperties) : undefined}
        >
            <div ref={skelRef} className="t-skel-skeleton is-pulsing" aria-hidden="true">
                {skeleton}
            </div>
            <div className="t-skel-content">{children}</div>
        </div>
    );
}
