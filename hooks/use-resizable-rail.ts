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
        }
    }, []);

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
        try {
            window.localStorage.setItem(STORAGE_KEY, String(widthRef.current));
        } catch { /* not worth failing the drag over */ }
    }, []);

    /** Double-click the handle to go back to the default width. */
    const reset = useCallback(() => {
        widthRef.current = RAIL_BASE_PX;
        setWidth(RAIL_BASE_PX);
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */ }
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
