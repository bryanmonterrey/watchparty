"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Drag-to-resize for the live page's chat rail.
//
// Pointer events rather than mouse events, so a trackpad, a pen and a touch
// screen all work from one code path, and setPointerCapture keeps the drag
// alive when the cursor outruns the 6px handle — which it will, because people
// drag fast and the handle is thin.

/** The rail's natural width — RAIL_ASIDE's w-96. */
export const RAIL_BASE_PX = 384;

/** How far it may travel either way. w-20, per owner spec. */
export const RAIL_RANGE_PX = 80;

const MIN = RAIL_BASE_PX - RAIL_RANGE_PX;
const MAX = RAIL_BASE_PX + RAIL_RANGE_PX;

const STORAGE_KEY = "wp:chat-rail-width";

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

export function useResizableRail() {
    const [width, setWidth] = useState(RAIL_BASE_PX);
    const [dragging, setDragging] = useState(false);
    // Mirrors `width` for the pointerup handler, which needs the latest value
    // without re-subscribing on every pixel of movement.
    const widthRef = useRef(RAIL_BASE_PX);
    const startRef = useRef<{ x: number; w: number } | null>(null);

    /** False until the stored width has been read, so the write below can't
     *  race ahead and save the default over it. */
    const loadedRef = useRef(false);

    // After mount, never during render — the rail server-renders and reading
    // localStorage in render is a hydration mismatch.
    useEffect(() => {
        try {
            const stored = Number(window.localStorage.getItem(STORAGE_KEY));
            if (Number.isFinite(stored) && stored > 0) {
                const next = clamp(stored);
                widthRef.current = next;
                setWidth(next);
            }
        } catch {
            // storage disabled — the default is fine
        } finally {
            loadedRef.current = true;
        }
    }, []);

    // Persist on every settled width rather than only at the end of a drag.
    //
    // Saving in the pointerup handler alone was too fragile: it depends on that
    // one event arriving on the same element the capture was taken on, and any
    // path that ends a drag differently (pointercancel during a gesture, a
    // re-render swapping the node, the pointer leaving the window) silently
    // dropped the write and the rail was back to 384 on the next load. Keying
    // it to the value means the value is what gets saved, however the drag ends.
    useEffect(() => {
        if (!loadedRef.current) return;
        try {
            window.localStorage.setItem(STORAGE_KEY, String(width));
        } catch { /* storage disabled */ }
    }, [width]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
        // Stops the drag from selecting the chat text it passes over.
        e.preventDefault();
        startRef.current = { x: e.clientX, w: widthRef.current };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const start = startRef.current;
        if (!start) return;
        // The rail is anchored right, so dragging the LEFT edge leftwards —
        // a negative delta — makes it wider.
        const next = clamp(start.w - (e.clientX - start.x));
        widthRef.current = next;
        setWidth(next);
    }, []);

    const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!startRef.current) return;
        startRef.current = null;
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        // The width effect above does the saving.
    }, []);

    /** Double-click the handle to go back to the default width. */
    const reset = useCallback(() => {
        widthRef.current = RAIL_BASE_PX;
        setWidth(RAIL_BASE_PX);
        // Written back as the default rather than removed — the effect above
        // would immediately re-save it anyway, and a key that reappears after
        // being deleted is more confusing than one that just holds 384.
    }, []);

    return {
        width,
        dragging,
        handleProps: {
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onDoubleClick: reset,
        },
    };
}
