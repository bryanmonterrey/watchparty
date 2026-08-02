"use client";

import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

// The box a rail's LIST lives in — not its tabs. Home's video rail and the left
// alerts rail both use it, so the two can't drift.
//
// No fill. The COLUMNS are separated by a hairline on the rails themselves (see
// home-left-rail), which runs the full height rather than stopping at the list;
// the optional `bordered` here is a different thing — an outline around the list
// box itself, which only the alerts rail wants.
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

// flexwhite's dark value (#e7e9ea) at 10% — i.e. what `border-flexwhite/10`
// would resolve to if it survived, which it doesn't: a CSS border is part of the
// element's own painting, and the clip-path is inscribed in the border box, so
// it gets cut away at exactly the corners the squircle exists for. Declaring it
// as a Lisse effect instead means it's stroked into the wrapper Lisse injects,
// which is never clipped, and traces the same curve.
const BORDER = { width: 1, color: "#e7e9ea", opacity: 0.1 };

export function RailShell({
    children,
    className,
    radius = 16,
    bordered = false,
}: {
    children: React.ReactNode;
    className?: string;
    /** Corner radius of the list box. */
    radius?: number;
    /** Outline the box. Off by default — only the alerts rail wants it. */
    bordered?: boolean;
}) {
    return (
        // mb-2 lifts the box off the bottom of the screen — both rails are
        // h-screen sticky columns, so without it the list runs flush into the
        // viewport edge. pb-2 is separate, and only keeps the last row off the
        // bottom from the inside.
        <div className={cn("mb-2 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)]", className)}>
            <Squircle
                radius={radius}
                autoEffects={false}
                innerBorder={bordered ? BORDER : undefined}
                className="flex size-full min-h-0 flex-col pb-2"
            >
                {children}
            </Squircle>
        </div>
    );
}
