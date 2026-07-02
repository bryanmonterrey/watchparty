"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Phantom-style scroll background: the page has ONE solid background color that
// TRANSITIONS to a new solid color as you scroll into a new zone — not a painted
// top-to-bottom gradient. Mark zones with `data-bg="<css color>"`; whichever zone
// has crossed the trigger line owns the background, and the CSS color transition
// smooths the hand-off. `initial` should match the first zone's color so there's
// no jump on load.
export function ColorScrollPage({
    children,
    initial,
    className,
}: {
    children: React.ReactNode;
    initial: string;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [bg, setBg] = useState(initial);

    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        const zones = Array.from(root.querySelectorAll<HTMLElement>("[data-bg]"));
        if (!zones.length) return;

        let raf = 0;
        let current = initial;
        const update = () => {
            raf = 0;
            // The zone whose top has last crossed ~45% of the viewport owns the bg.
            const line = window.innerHeight * 0.45;
            let pick = zones[0].dataset.bg || initial;
            for (const z of zones) {
                if (z.getBoundingClientRect().top <= line) pick = z.dataset.bg || pick;
            }
            if (pick !== current) {
                current = pick;
                setBg(pick);
            }
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(update);
        };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [initial]);

    return (
        <div
            ref={ref}
            className={cn("transition-colors duration-700 ease-out", className)}
            style={{ backgroundColor: bg }}
        >
            {children}
        </div>
    );
}

// A background color zone. Wrap a group of sections so they share one canvas
// color; the ColorScrollPage transitions to `bg` when this zone scrolls in.
export function BgZone({ bg, children }: { bg: string; children: React.ReactNode }) {
    return <div data-bg={bg}>{children}</div>;
}
