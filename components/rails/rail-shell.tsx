"use client";

import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

// The bordered, squircled box a rail's LIST lives in — not its tabs. Home's
// video rail and the left alerts rail both use it, so the two can't drift.
//
// Radius 12 matches RailRow, so a row's hover squircle sits concentrically
// inside the container's rather than fighting it.
//
// Two structural notes, both load-bearing:
//
// 1. `grid`, not `flex`, on the outer box. Lisse draws the border as an SVG
//    effect, and when any effect is on it injects a bare `position:relative`
//    div between this box and the squircled element. That wrapper carries no
//    classes we can reach, so it has to size itself — and a grid item stretches
//    on BOTH axes by default, while a flex-column child stretches only across.
//    Under flex the wrapper would take its height from content and the list
//    would grow the rail instead of scrolling inside it.
//
// 2. The border is an EXPLICIT innerBorder config, not a CSS `border` class.
//    A CSS border is part of the element's own painting, so the clip-path —
//    which is inscribed in the border box — cuts it away at exactly the corners
//    the squircle exists for. autoEffects is supposed to lift a CSS border out
//    into SVG for you, but it did not here (grokborder is an `oklch(… none …)`
//    value, which its extractor appears not to parse), and a border that silently
//    falls back to being clipped is the bug we just fixed. Declaring it removes
//    the guesswork: Lisse strokes it into the wrapper, which is never clipped.
//    autoEffects is off for the same reason — one path, no fallback.
//
// The caller owns scrolling: pass a child that is `min-h-0 flex-1 overflow-y-auto`.

// --color-grokborder is oklch(0.9924 0 none / 0.08) — a near-white at 8%.
// Split into hex + opacity because those are the forms Lisse parses reliably.
const BORDER = { width: 1, color: "#fcfcfc", opacity: 0.08 };

export function RailShell({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("grid min-h-0 flex-1", className)}>
            <Squircle
                radius={12}
                autoEffects={false}
                innerBorder={BORDER}
                className="flex size-full min-h-0 flex-col pb-2"
            >
                {children}
            </Squircle>
        </div>
    );
}
