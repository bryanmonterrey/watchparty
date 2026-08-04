"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// The scroll control for both tab strips — the home column's categories and
// the right rail's tabs. One component rather than a copy each, so "same icon,
// same size in both places" is a fact rather than something to keep in sync.
//
// Overlaid on its strip rather than sitting beside it: the blur wants labels
// behind it, and a control that toggles with scroll position would otherwise
// resize the strip and shove the labels sideways every time it appeared.
export function TabScrollArrow({
    direction,
    onClick,
    label,
}: {
    direction: "left" | "right";
    onClick: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
                "absolute top-1/2 z-10 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full",
                "bg-soft-gray-10 text-flexwhite/85 border border-flexwhite/10 transition-colors hover:bg-sidebar-hover-55 hover:text-white",
                direction === "left" ? "left-0" : "right-0"
            )}
        >
            <HugeiconsIcon
                icon={direction === "left" ? ArrowLeft01Icon : ArrowRight01Icon}
                className="size-5"
                strokeWidth={2}
            />
        </button>
    );
}
