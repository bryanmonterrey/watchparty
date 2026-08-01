"use client";

import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

// The bordered, squircled box a rail's LIST lives in — not its tabs. Home's
// video rail and the left alerts rail both use it, so the two can't drift.
//
// Radius 12 matches RailRow, so a row's hover squircle traces the same arc as
// the container it sits in.
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
const BORDER = { width: 1, color: "#fcfcfc", opacity: 0.01 };

export function RailShell({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        // mb-2 on the OUTER box, not padding on the inner one: both rails are
        // h-screen sticky columns, so without it the shell's bottom border
        // lands exactly on the viewport edge and reads as a missing border
        // rather than a container that ends. The margin lifts the whole
        // bordered box; the pb-2 below is separate, and only keeps the last row
        // off the border.
        // minmax(0,1fr), not the implicit `auto` track: an auto row sizes to
        // MAX-CONTENT, so the row grew to the whole list's height, the wrapper
        // grew with it, and the scroller below ended up with an unbounded
        // flex basis — the rail stopped scrolling entirely. Pinning the track
        // to the box's own height (0 minimum) is what bounds it. The column
        // gets the same treatment so a long unbreakable title can't widen the
        // rail either.
        <div className={cn("mb-2 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)]", className)}>
            <Squircle
                radius={12}
                autoEffects={false}
                innerBorder={BORDER}
                className="flex size-full bg-soft-gray-5 min-h-0 flex-col pb-2"
            >
                {children}
            </Squircle>
        </div>
    );
}
