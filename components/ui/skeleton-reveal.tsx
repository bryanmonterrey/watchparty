"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cross-fade a skeleton into its content without moving anything.
 *
 * Buzz's `SkeletonReveal` (`shared/ui/skeleton.tsx`), in Tailwind rather than
 * their `t-skel` stylesheet.
 *
 * ## The technique
 *
 * Both children occupy the SAME grid cell (`[grid-area:1/1]`), so they overlap
 * instead of stacking. Loading fades the skeleton out and the content in; the
 * outgoing skeleton also picks up a 2px blur, which reads as it dissolving
 * rather than dimming. Nothing is unmounted and remounted, so nothing reflows —
 * the usual "skeleton disappears, content appears one pixel to the left" jump
 * comes from swapping one subtree for a differently-sized other.
 *
 * ⚠️ That guarantee only holds if the SKELETON MIRRORS THE CONTENT'S CHROME.
 * A grid cell is as tall as its tallest child, so a skeleton shorter than the
 * content it stands in for still grows on reveal — this component removes the
 * swap, not the size difference. Adopt it where the skeleton already wears the
 * real component's shape (rails, tiles, alerts), which is the house rule anyway.
 *
 * ## No shimmer
 *
 * The sweep was removed on 2026-07-28 and is not coming back; the skeleton is a
 * still flat fill. This adds a cross-fade on the way OUT, which is a transition
 * between states rather than an animation that runs while you wait.
 *
 * Reduced motion gets a straight swap — the fade is decoration, and dissolving
 * blur is exactly the sort of thing the setting exists to stop.
 */
export function SkeletonReveal({
    loading,
    skeleton,
    children,
    className,
    contentClassName,
    skeletonClassName,
}: {
    loading: boolean;
    skeleton: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    skeletonClassName?: string;
}) {
    return (
        <div className={cn("grid", className)} data-state={loading ? "loading" : "loaded"}>
            <div
                aria-hidden
                className={cn(
                    "[grid-area:1/1] transition-[opacity,filter] duration-200 motion-reduce:transition-none",
                    loading ? "opacity-100" : "pointer-events-none opacity-0 blur-[2px]",
                    skeletonClassName,
                )}
            >
                {skeleton}
            </div>
            <div
                // Hidden from assistive tech while it is still a placeholder,
                // even though it is in the DOM holding its space.
                aria-hidden={loading}
                className={cn(
                    "[grid-area:1/1] transition-opacity duration-200 motion-reduce:transition-none",
                    loading ? "pointer-events-none opacity-0" : "opacity-100",
                    contentClassName,
                )}
            >
                {children}
            </div>
        </div>
    );
}
