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

/** Floor for the thumb, not its size.
 *
 *  This used to be a CONSTANT 90px height that never scaled — taken from the
 *  library this was modelled on, to stop an infinite list shrinking the thumb
 *  toward a dot. That problem is real; a fixed height is the wrong fix for it.
 *
 *  A proportional thumb carries information a fixed one throws away: how much
 *  content there is. Every native scrollbar (macOS, iOS, Windows) is
 *  proportional for exactly that reason, and a fixed thumb is why this felt
 *  un-native — it reads as a position dot, not a scrollbar.
 *
 *  A MINIMUM keeps both: proportional wherever there's room, clamped before it
 *  can become a tick. 40px is roughly where a thumb stops reading as a handle,
 *  and matches what browsers themselves clamp to. */
const MIN_THUMB_PX = 40;
/** Resting height, used whenever the pointer ISN'T over the rail.
 *
 *  This is the resolution to the fixed-vs-proportional argument rather than a
 *  compromise between them, because the two states want different things:
 *
 *    - While you're just scrolling past, the only question is "where am I".
 *      A constant 48px answers that and — crucially — never degenerates, so an
 *      infinite list can't shrink it to a tick no matter how much loads in.
 *    - On hover you're about to interact, and now "how much is there" matters
 *      and the thumb has to be worth grabbing. So it expands to its true
 *      proportional height.
 *
 *  Same trick as macOS, which swaps a thin overlay bar for a fatter draggable
 *  one when the pointer approaches. */
const RESTING_THUMB_PX = 48;
/** Inset from the scroller's top and bottom edges. */
const TRACK_INSET_PX = 6;
/** How long the bar stays up after the last scroll before fading out.
 *
 *  Auto-hide is the modern default — macOS/iOS/Android all show the indicator
 *  while scrolling and fade it when idle, so it answers "where am I" without
 *  permanently spending a strip of the design on chrome. 1200ms is long enough
 *  to still be there when you glance down after a flick. */
const IDLE_HIDE_MS = 1200;

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
    topPx = TRACK_INSET_PX,
    className,
}: {
    /** Resolved on mount and retried for a few frames — BidirectionalList
     *  creates its scroller after its parent's first effect run. */
    getScroller: () => HTMLElement | null;
    /** Where the track starts. Defaults to the standard inset; pass the height
     *  of anything pinned over the top of the scroller (home's rail tabs) so the
     *  thumb isn't hidden behind it at scroll 0. */
    topPx?: number;
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
        // Measured each pass now that the thumb is proportional, and read by
        // both the travel maths and the drag handler.
        let thumbH = MIN_THUMB_PX;
        let scrollable = false;
        let hovering = false;
        let dragging = false;
        let dragStartY = 0;
        let dragStartScroll = 0;
        let idleTimer: ReturnType<typeof setTimeout> | undefined;

        const reduceMotion =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const paint = (y: number) => {
            thumb.style.transform = `translate3d(0, ${y}px, 0)`;
        };

        // Visible while scrolling, faded when idle — unless the pointer is over
        // the rail, in which case it stays up because the user is plainly
        // looking at this column.
        const show = () => {
            if (!scrollable) return;
            track.style.opacity = "1";
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (!hovering) track.style.opacity = "0";
            }, IDLE_HIDE_MS);
        };

        const measure = () => {
            if (!scroller) return;
            const distance = scroller.scrollHeight - scroller.clientHeight;
            // Nothing to scroll: hide entirely rather than parking a thumb that
            // can't move. A rail that simply has few rows shouldn't advertise a
            // scrollbar at all.
            if (distance <= 1) {
                scrollable = false;
                track.style.opacity = "0";
                return;
            }
            scrollable = true;

            // Proportional: the thumb covers the same fraction of the track
            // that the viewport covers of the content. Clamped so a very long
            // list still leaves something grabbable.
            const trackH = track.clientHeight;
            // True proportional height — what the thumb shows on hover.
            const trueH = Math.max(
                MIN_THUMB_PX,
                Math.round(trackH * (scroller.clientHeight / scroller.scrollHeight)),
            );
            // Resting is a flat 48 unless the content is SHORT enough that the
            // honest thumb is already smaller; expanding on hover should never
            // shrink it, which would read as the bar recoiling from the cursor.
            thumbH = hovering || dragging ? trueH : Math.min(RESTING_THUMB_PX, trueH);
            thumb.style.height = `${thumbH}px`;

            const progress = Math.max(0, Math.min(1, scroller.scrollTop / distance));
            // Travel is the track minus the thumb, so a full scroll lands the
            // thumb exactly at the bottom instead of running past it.
            target = progress * Math.max(0, trackH - thumbH);
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
            show();
            start();
        };

        // Dragging the thumb. A pure indicator was the old behaviour and it is
        // the main thing that made this feel unlike a scrollbar — every native
        // one can be grabbed. Only the THUMB takes pointer events (the track
        // stays transparent to clicks), so this cannot swallow presses meant for
        // the rail underneath it.
        const onPointerDown = (e: PointerEvent) => {
            if (!scroller || !scrollable) return;
            e.preventDefault();
            thumb.setPointerCapture(e.pointerId);
            dragging = true;
            dragStartY = e.clientY;
            dragStartScroll = scroller.scrollTop;
            show();
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!dragging || !scroller) return;
            const travel = Math.max(1, track.clientHeight - thumbH);
            const distance = scroller.scrollHeight - scroller.clientHeight;
            // Map thumb pixels to content pixels, so the content keeps pace with
            // the cursor rather than lagging or racing it.
            scroller.scrollTop = dragStartScroll + ((e.clientY - dragStartY) / travel) * distance;
        };

        const onPointerUp = (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            thumb.releasePointerCapture?.(e.pointerId);
            show();
        };

        // Both re-measure: changing the thumb's height changes the travel
        // (trackH - thumbH), so the position has to be recomputed or the thumb
        // would sit at the wrong offset for its new size — most visibly at the
        // bottom of a list, where it would overhang the track.
        const onEnter = () => {
            hovering = true;
            measure();
            show();
            start();
        };
        const onLeave = () => {
            hovering = false;
            measure();
            show();
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
            scroller.addEventListener("pointerenter", onEnter);
            scroller.addEventListener("pointerleave", onLeave);
            // The track is an absolutely-positioned SIBLING of the scroller,
            // not a descendant, so the scroller's pointerenter never fires for
            // the bar itself. Without these, moving the cursor toward the thumb
            // to grab it would read as leaving the rail and collapse it back to
            // 48px under the pointer — the exact opposite of an affordance.
            track.addEventListener("pointerenter", onEnter);
            track.addEventListener("pointerleave", onLeave);
            thumb.addEventListener("pointerdown", onPointerDown);
            thumb.addEventListener("pointermove", onPointerMove);
            thumb.addEventListener("pointerup", onPointerUp);
            thumb.addEventListener("pointercancel", onPointerUp);
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
            clearTimeout(idleTimer);
            observer.disconnect();
            scroller?.removeEventListener("scroll", onScroll);
            scroller?.removeEventListener("pointerenter", onEnter);
            scroller?.removeEventListener("pointerleave", onLeave);
            track.removeEventListener("pointerenter", onEnter);
            track.removeEventListener("pointerleave", onLeave);
            thumb.removeEventListener("pointerdown", onPointerDown);
            thumb.removeEventListener("pointermove", onPointerMove);
            thumb.removeEventListener("pointerup", onPointerUp);
            thumb.removeEventListener("pointercancel", onPointerUp);
        };
    }, [getScroller]);

    return (
        <div
            ref={trackRef}
            aria-hidden
            style={{ top: topPx, bottom: TRACK_INSET_PX }}
            className={cn(
                // The TRACK stays pointer-events-none so it can never swallow a
                // press meant for the rail beneath it; the thumb below opts
                // back in, which is what makes dragging possible without
                // putting an 8px dead strip down the side of the column.
                //
                // w-[8px]: the thumb is w-full, so the track's width IS the
                // indicator's. 8px is roughly a native scrollbar thumb — what
                // `scrollbar-width: thin` renders.
                //
                // Starts at opacity-0 and is raised by show() on scroll or
                // hover: auto-hide is what macOS/iOS/Android all do, so the
                // indicator answers "where am I" without permanently spending a
                // strip of the layout on chrome.
                "pointer-events-none absolute right-0.5 z-10 w-[8px] opacity-0 transition-opacity duration-300",
                className,
            )}
        >
            {/* Height is set in measure(), not here — it's proportional now.
                touch-action-none so a drag on the thumb doesn't also scroll the
                page on touch devices. Widens slightly on hover, the one bit of
                affordance that says "this is grabbable". */}
            <div
                ref={thumbRef}
                style={{ height: RESTING_THUMB_PX }}
                // height transitions with the colour: the resting→true growth
                // should read as the bar offering itself, not as a jump. Kept
                // to 200ms so it lands before a deliberate move to grab it.
                className="pointer-events-auto w-full cursor-grab touch-none rounded-full bg-flexwhite/25 transition-[height,background-color] duration-200 ease-out hover:bg-flexwhite/40 active:cursor-grabbing active:bg-flexwhite/50"
            />
        </div>
    );
}
