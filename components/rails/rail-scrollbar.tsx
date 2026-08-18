"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// An overlay scrollbar for the rails, rebuilt on Base UI's ScrollArea model
// (https://base-ui.com/react/components/scroll-area) — its geometry, its
// visibility rules and its look, reimplemented as an OVERLAY over a scroller
// this component doesn't own.
//
// Why not `<ScrollArea.Root>` itself: Base UI's parts only work when the
// viewport is its own element, and none of the three consumers can give it
// one. BidirectionalList (alerts rail) creates and owns its scroll element
// internally; rail-card and chat-panel pin content INSIDE the scroller. So the
// component takes a `getScroller` callback and hangs an absolutely-positioned
// track next to whatever it finds.
//
// WHAT CHANGED, and why (the previous version lagged behind the wheel):
// it held a spring (stiffness 500 / damping 30) integrated on rAF, so the
// thumb *chased* the scroll position instead of reporting it. Any spring has
// settle time by definition, which is exactly the "out of sync with my
// scrolling" symptom — the faster you scroll, the further behind it sits.
// Base UI has no spring: it writes `transform` synchronously inside the scroll
// handler, which runs before paint, so the thumb lands in the SAME frame as the
// content it describes. That's the whole fix, and it also deletes the rAF loop.
//
// Everything else here is motion the rebuild deliberately dropped: the thumb no
// longer animates its height on hover (it was proportional-on-hover and a flat
// 48px otherwise, so it resized under the cursor and re-derived its own travel
// mid-gesture), and nothing transitions but opacity.
//
// NOTE this reintroduces a visible scroll affordance into an app whose
// globals.css hides scrollbars everywhere (`* { scrollbar-width: none }`).
// Deliberate, and scoped to the surfaces that opt in.

/** Floor for the thumb — Base UI's `MIN_THUMB_SIZE` is 16, raised here because
 *  these rails are infinite lists: proportional wherever there's room, clamped
 *  before it degenerates into a tick you can't grab. */
const MIN_THUMB_PX = 32;
/** Inset from the scroller's top and bottom edges. */
const TRACK_INSET_PX = 6;
/** Idle delay before the bar fades, matching Base UI's `SCROLL_TIMEOUT`. */
const SCROLL_TIMEOUT_MS = 500;

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
    // Held in a ref, and the effect below runs ONCE. Every consumer passes an
    // inline arrow, so depending on `getScroller` directly would tear down and
    // re-attach every listener plus the ResizeObserver on every render — and
    // the alerts rail re-renders on every incoming alert.
    const getScrollerRef = useRef(getScroller);
    getScrollerRef.current = getScroller;
    const rebindRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const thumb = thumbRef.current;
        const track = trackRef.current;
        if (!thumb || !track) return;

        let scroller: HTMLElement | null = null;
        let attachRaf = 0;
        let scrollable = false;
        // Hover is tracked as two flags because the track is a SIBLING of the
        // scroller, not a descendant: moving the cursor onto the thumb fires
        // `pointerleave` on the scroller. One flag would collapse the bar at
        // the exact moment you reach for it.
        let overScroller = false;
        let overThumb = false;
        let dragging = false;
        let pointerId: number | null = null;
        let dragStartY = 0;
        let dragStartScroll = 0;
        let thumbH = MIN_THUMB_PX;
        let idleTimer: ReturnType<typeof setTimeout> | undefined;

        // Visible while scrolling or while the pointer is on the rail, faded
        // otherwise — the fade-in is quick and the fade-out is slow and
        // delayed, which is Base UI's rule and reads as the bar receding rather
        // than blinking off. The classes live on the element; this only flips
        // the flag they key off.
        const setVisible = (visible: boolean) => {
            track.dataset.visible = visible && scrollable ? "true" : "false";
        };

        const show = () => {
            if (!scrollable) return;
            setVisible(true);
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                if (!overScroller && !overThumb && !dragging) setVisible(false);
            }, SCROLL_TIMEOUT_MS);
        };

        // Base UI's `computeThumbPosition`, single-axis. Sizing and positioning
        // are ONE pass on purpose: the thumb's height decides its own travel
        // (track - thumb), so computing them apart lets the two disagree for a
        // frame — most visibly at the end of a list, where the thumb overhangs.
        const sync = () => {
            if (!scroller) return;

            const content = scroller.scrollHeight;
            const viewport = scroller.clientHeight;
            const maxScroll = Math.max(0, content - viewport);

            // Nothing to scroll: hide entirely rather than parking a thumb that
            // can't move. A rail with few rows shouldn't advertise a scrollbar.
            if (maxScroll <= 1 || content === 0) {
                scrollable = false;
                setVisible(false);
                return;
            }
            scrollable = true;

            const trackH = track.clientHeight;
            thumbH = Math.max(MIN_THUMB_PX, trackH * (viewport / content));
            thumb.style.height = `${thumbH}px`;

            // Clamped, so Safari's rubber-band overscroll (a negative scrollTop,
            // or one past the end) pins the thumb to the edge instead of
            // running it off the track.
            const clamped = Math.min(Math.max(scroller.scrollTop, 0), maxScroll);
            const maxThumbOffset = Math.max(0, trackH - thumbH);
            const offset = (clamped / maxScroll) * maxThumbOffset;
            thumb.style.transform = `translate3d(0,${offset}px,0)`;
        };

        const onScroll = () => {
            sync();
            show();
        };

        // Dragging the thumb. Only the THUMB takes pointer events — the track
        // stays transparent to them — so this can never swallow a press meant
        // for the rail underneath it.
        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0 || !scroller || !scrollable) return;
            e.preventDefault();
            pointerId = e.pointerId;
            thumb.setPointerCapture(e.pointerId);
            dragging = true;
            dragStartY = e.clientY;
            dragStartScroll = scroller.scrollTop;
            show();
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!dragging || !scroller || e.pointerId !== pointerId) return;
            // A release can go missing (the browser can drop capture), which
            // would leave a buttonless hover scrolling the rail. Base UI reads
            // the primary-button bit to detect that.
            if (e.buttons % 2 === 0) {
                onPointerUp(e);
                return;
            }
            const maxThumbOffset = track.clientHeight - thumbH;
            if (maxThumbOffset <= 0) return;
            const ratio = (e.clientY - dragStartY) / maxThumbOffset;
            const maxScroll = scroller.scrollHeight - scroller.clientHeight;
            scroller.scrollTop = dragStartScroll + ratio * maxScroll;
            e.preventDefault();
        };

        const onPointerUp = (e: PointerEvent) => {
            if (!dragging || e.pointerId !== pointerId) return;
            dragging = false;
            pointerId = null;
            if (thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
            show();
        };

        const onScrollerEnter = () => {
            overScroller = true;
            sync();
            show();
        };
        const onScrollerLeave = () => {
            overScroller = false;
            show();
        };
        const onThumbEnter = () => {
            overThumb = true;
            show();
        };
        const onThumbLeave = () => {
            overThumb = false;
            show();
        };

        // The list can grow under us (pagination) without a scroll event, which
        // changes scrollHeight and therefore both the thumb's size and where it
        // belongs.
        const observer = new ResizeObserver(() => sync());

        // Thumb listeners outlive any one scroller — the thumb is ours and
        // never changes — so they're bound once, outside attach().
        thumb.addEventListener("pointerenter", onThumbEnter);
        thumb.addEventListener("pointerleave", onThumbLeave);
        thumb.addEventListener("pointerdown", onPointerDown);
        thumb.addEventListener("pointermove", onPointerMove);
        thumb.addEventListener("pointerup", onPointerUp);
        thumb.addEventListener("pointercancel", onPointerUp);

        const detachScroller = () => {
            if (!scroller) return;
            scroller.removeEventListener("scroll", onScroll);
            scroller.removeEventListener("pointerenter", onScrollerEnter);
            scroller.removeEventListener("pointerleave", onScrollerLeave);
            observer.disconnect();
            scroller = null;
        };

        const attach = (tries: number) => {
            const next = getScrollerRef.current();
            if (!next) {
                if (tries > 0) attachRaf = requestAnimationFrame(() => attach(tries - 1));
                return;
            }
            if (next === scroller) return;
            detachScroller();
            scroller = next;
            scroller.addEventListener("scroll", onScroll, { passive: true });
            scroller.addEventListener("pointerenter", onScrollerEnter);
            scroller.addEventListener("pointerleave", onScrollerLeave);
            observer.observe(scroller);
            if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
            sync();
        };
        attach(10);

        // The scroll element can be REPLACED under us without this component
        // remounting: the alerts rail keys its BidirectionalList, so changing a
        // filter throws away the old scroller while the bar stays put. The
        // per-render effect below calls this; without it the bar would sit
        // frozen, listening to a detached node.
        rebindRef.current = () => attach(10);

        return () => {
            rebindRef.current = null;
            cancelAnimationFrame(attachRaf);
            clearTimeout(idleTimer);
            detachScroller();
            thumb.removeEventListener("pointerenter", onThumbEnter);
            thumb.removeEventListener("pointerleave", onThumbLeave);
            thumb.removeEventListener("pointerdown", onPointerDown);
            thumb.removeEventListener("pointermove", onPointerMove);
            thumb.removeEventListener("pointerup", onPointerUp);
            thumb.removeEventListener("pointercancel", onPointerUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Deliberately no dependency array: one cheap identity check per render,
    // which is what keeps the effect above from re-running (and re-observing)
    // on every render while still surviving a swapped-out scroller.
    useEffect(() => {
        rebindRef.current?.();
    });

    return (
        <div
            ref={trackRef}
            aria-hidden
            data-visible="false"
            style={{ top: topPx, bottom: TRACK_INSET_PX }}
            className={cn(
                // The TRACK is pointer-events-none so it can never swallow a
                // press meant for the rail beneath it; the thumb opts back in,
                // which is what makes dragging possible without putting a dead
                // strip down the side of the column.
                //
                // Opacity is the only thing that animates, and asymmetrically:
                // 75ms in with no delay so it's there the instant you touch the
                // wheel, 150ms out after a 300ms hold so it doesn't flicker
                // between two flicks. Straight from Base UI's demo styles.
                "pointer-events-none absolute right-0.5 z-10 w-[10px]",
                "opacity-0 transition-opacity delay-300 duration-150 ease-out",
                "data-[visible=true]:opacity-100 data-[visible=true]:delay-0 data-[visible=true]:duration-75",
                className,
            )}
        >
            {/* Height and transform are written by sync(); neither transitions
                — the thumb reports the scroll position, it doesn't animate
                toward it. The transparent side borders with bg-clip-padding
                give a 6px bar with a 10px grab target, so the thumb stays thin
                without being fiddly to catch.

                Plain white rather than `flexwhite`: every surface this bar sits
                over is `bg-canvas`, a literal rgb(5,5,5) that never lightens,
                while `--flexwhite` flips to near-black in the light theme —
                which would paint the thumb black on black. */}
            <div
                ref={thumbRef}
                style={{ height: MIN_THUMB_PX }}
                className="pointer-events-auto w-full cursor-default touch-none rounded-full border-x-2 border-transparent bg-white/25 bg-clip-padding transition-colors duration-100 hover:bg-white/40 active:bg-white/55"
            />
        </div>
    );
}
