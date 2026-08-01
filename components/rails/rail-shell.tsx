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
// 1. `grid`, not `flex`, on the outer box. Lisse renders the border as an SVG
//    effect, and when any effect is on it injects a bare `position:relative`
//    div between this box and the squircled element. That wrapper carries no
//    classes we can reach, so it has to size itself — and a grid item stretches
//    on BOTH axes by default, while a flex-column child stretches only across.
//    Under flex the wrapper would take its height from content and the list
//    would grow the rail instead of scrolling inside it.
//
// 2. The border must come from Lisse's effect path (autoEffects, i.e. the
//    default), NOT from a plain CSS border under `autoEffects={false}`. The
//    clip-path is inscribed in the border box, so it cuts a CSS border away at
//    exactly the corners the squircle is for. Letting Lisse extract it means it
//    gets drawn as a stroke tracing the same curve.
//
// The caller owns scrolling: pass a child that is `min-h-0 flex-1 overflow-y-auto`.
export function RailShell({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("grid min-h-0 flex-1", className)}>
            <Squircle radius={12} className="flex size-full min-h-0 flex-col border border-grokborder">
                {children}
            </Squircle>
        </div>
    );
}
