"use client";

import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

// The box a rail's LIST lives in — not its tabs. Home's video rail and the left
// alerts rail both use it, so the two can't drift.
//
// No fill and no border of its own any more: the columns are separated by a
// hairline on the rails themselves (see home-left-rail / home-page-surface),
// which runs the full height rather than stopping at the list. What's left here
// is the bounded box and the squircle.
//
// The squircle still earns its place with nothing painted: rows carry their own
// hover fill, and at the very top and bottom of the list that fill would
// otherwise square off the corners of the box it sits in.
//
// `grid`, not `flex`, with an explicit minmax(0,1fr) track. An implicit `auto`
// row sizes to MAX-CONTENT, which sized the row to the whole list's height and
// left the scroller below with an unbounded flex basis — the rail stopped
// scrolling entirely. Pinning the track to the box's own height (0 minimum) is
// what bounds it; the column gets the same so a long unbreakable title can't
// widen the rail.
//
// The caller owns scrolling: pass a child that is `min-h-0 flex-1 overflow-y-auto`.
export function RailShell({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        // mb-2 lifts the box off the bottom of the screen — both rails are
        // h-screen sticky columns, so without it the list runs flush into the
        // viewport edge. pb-2 is separate, and only keeps the last row off the
        // bottom from the inside.
        <div className={cn("mb-2 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)]", className)}>
            <Squircle radius={16} autoEffects={false} className="flex size-full min-h-0 flex-col pb-2">
                {children}
            </Squircle>
        </div>
    );
}
