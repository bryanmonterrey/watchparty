"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// A scroll indicator for the rails, modelled on rs-4/curved-scrollbar-expo.
//
// THE IDEA WORTH TAKING from that library isn't the curve — it's that the
// indicator has a CONSTANT LENGTH. A normal scrollbar's thumb is proportional
// to content, so an infinite list (which both rails are) shrinks it toward a
// dot and it reads as broken. That library draws a fixed 70px segment and only
// ever MOVES it, so the indicator looks the same at ten rows or ten thousand.
// It gets that by holding stroke-dasharray at `${visibleLength} ${totalLength}`
// and animating only the offset. On a straight track the same property falls
// out of a fixed-height thumb and a translate, with no SVG at all — hence no
// curve here, which was fine to drop.
//
// The library is React Native (Reanimated + react-native-svg + NativeWind) and
// its "web" support means react-native-web, which this app doesn't use. So this
// is the behaviour reimplemented on DOM, not the package.
//
// NOTE this reintroduces a visible scroll affordance into an app whose
// globals.css hides scrollbars everywhere (`* { scrollbar-width: none }`).
// Deliberate, and scoped to the two rails that opt in.

/** Constant thumb height. The stable property — never scales with content. */
const THUMB_PX = 70;
/** Inset from the scroller's top and bottom edges. */
const TRACK_INSET_PX = 6;

// Spring, ported from the library's { damping: 30, stiffness: 500 } and
// integrated per frame. Snappy and barely overshooting: with mass 1, critical
// damping here is 2*sqrt(500) ≈ 44.7, so 30 is under-damped but only slightly.
// Tone the whole thing down by raising DAMPING (toward 45 = no bounce at all)
// or lowering STIFFNESS.
const STIFFNESS = 500;
const DAMPING = 30;
/** Below this, snap and stop the loop — prevents a permanent rAF. */
const REST_PX = 0.1;

export function RailScrollbar({
    getScroller,
    className,
}: {
    /** Resolved on mount and retried for a few frames — BidirectionalList
     *  creates its scroller after its parent's first effect run. */
    getScroller: () => HTMLElement | null;
    className?: string;
}) {
    const thumbRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const thumb = thumbRef.current;
        const track = trackRef.current;
        if (!thumb || !track) return;

        let scroller: HTMLElement | null = null;
        let raf = 0;
        let attachRaf = 0;
        let current = 0;
        let target = 0;
        let velocity = 0;
        let last = 0;
        let running = false;

        const reduceMotion =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const paint = (y: number) => {
            thumb.style.transform = `translate3d(0, ${y}px, 0)`;
        };

        const measure = () => {
            if (!scroller) return;
            const scrollable = scroller.scrollHeight - scroller.clientHeight;
            // Nothing to scroll: hide entirely rather than parking a thumb that
            // can't move. The library dims to 0.3 here; a rail that simply has
            // few rows shouldn't advertise a scrollbar at all.
            if (scrollable <= 1) {
                track.style.opacity = "0";
                return;
            }
            track.style.opacity = "1";
            const progress = Math.max(0, Math.min(1, scroller.scrollTop / scrollable));
            // Travel is the track minus the thumb, so a full scroll lands the
            // thumb exactly at the bottom instead of running past it.
            target = progress * Math.max(0, track.clientHeight - THUMB_PX);
        };

        const tick = (now: number) => {
            const dt = Math.min((now - last) / 1000, 1 / 30); // clamp: a backgrounded tab
            last = now;                                       // must not fling the spring
            const displacement = current - target;
            velocity += (-STIFFNESS * displacement - DAMPING * velocity) * dt;
            current += velocity * dt;

            if (Math.abs(current - target) < REST_PX && Math.abs(velocity) < REST_PX) {
                current = target;
                velocity = 0;
                paint(current);
                running = false;
                return;
            }
            paint(current);
            raf = requestAnimationFrame(tick);
        };

        const start = () => {
            if (reduceMotion) {
                current = target;
                paint(current);
                return;
            }
            if (running) return;
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(tick);
        };

        const onScroll = () => {
            measure();
            start();
        };

        // The list can grow under us (pagination) without a scroll event, which
        // changes scrollHeight and therefore where the thumb belongs.
        const observer = new ResizeObserver(() => {
            measure();
            start();
        });

        const attach = (tries: number) => {
            scroller = getScroller();
            if (!scroller) {
                if (tries > 0) attachRaf = requestAnimationFrame(() => attach(tries - 1));
                return;
            }
            scroller.addEventListener("scroll", onScroll, { passive: true });
            observer.observe(scroller);
            if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
            measure();
            current = target;
            paint(current);
        };
        attach(10);

        return () => {
            cancelAnimationFrame(raf);
            cancelAnimationFrame(attachRaf);
            observer.disconnect();
            scroller?.removeEventListener("scroll", onScroll);
        };
    }, [getScroller]);

    return (
        <div
            ref={trackRef}
            aria-hidden
            style={{ top: TRACK_INSET_PX, bottom: TRACK_INSET_PX }}
            className={cn(
                // pointer-events-none: an indicator, not a control. Dragging it
                // would need hit-testing and a grab affordance, and neither rail
                // wants a second way to scroll.
                "pointer-events-none absolute right-0.5 z-10 w-[3px] opacity-0 transition-opacity duration-200",
                className,
            )}
        >
            <div
                ref={thumbRef}
                style={{ height: THUMB_PX }}
                className="w-full rounded-full bg-flexwhite/25"
            />
        </div>
    );
}
