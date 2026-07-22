"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

/**
 * Navigate on pointerdown instead of click — commits the navigation when the
 * mouse button goes DOWN, shaving the ~100ms press duration off every card
 * click (mouse only; touch pointerdown fires on scroll starts, so touch keeps
 * normal click semantics).
 *
 * Safety rails:
 * - skips nested interactive elements: button/a/input/video/[role=button],
 *   plus anything marked `cursor-pointer` other than the card root itself —
 *   this codebase's convention for clickable divs (avatar columns, media
 *   grids, quoted posts, hover-card triggers), so their own click handlers
 *   keep working; `[data-no-instant-nav]` opts out explicitly.
 * - skips modified clicks (cmd/ctrl/shift/alt) and non-primary buttons.
 * - skips when text is currently selected (a click meant to deselect).
 *
 * Known trade-off: starting a drag-to-select on plain card text navigates
 * instead. Remove the hook from a surface if that ever matters more.
 *
 * Wire BOTH handlers: `onPointerDown`, and in the existing onClick call
 * `consumedClick()` first — it returns true when pointerdown already
 * navigated, so click must do nothing.
 */
export function useInstantNav(getHref: () => string | null | undefined) {
    const router = useRouter();
    const handled = useRef(false);

    const onPointerDown = (e: React.PointerEvent) => {
        handled.current = false;
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const target = e.target as HTMLElement;
        const interactive = target.closest(
            "button, a, input, textarea, video, [role='button'], .cursor-pointer, [data-no-instant-nav]",
        );
        if (interactive && interactive !== e.currentTarget) return;
        if (window.getSelection()?.toString()) return;
        const href = getHref();
        if (!href) return;
        handled.current = true;
        router.push(href);
    };

    const consumedClick = () => {
        const wasHandled = handled.current;
        handled.current = false;
        return wasHandled;
    };

    return { onPointerDown, consumedClick };
}
