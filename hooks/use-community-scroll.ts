"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type CommunityScrollProps = {
    chatRef: React.RefObject<HTMLDivElement | null>;
    bottomRef: React.RefObject<HTMLDivElement | null>;
    shouldLoadMore: boolean;
    loadMore: () => void;
    count: number;
};

/**
 * Community chat could only ever load TWO pages.
 *
 * The trigger was `if (scrollTop === 0 && shouldLoadMore) loadMore()` on a
 * scroll listener, which needs a scroll EVENT landing on exactly zero. You
 * scroll up, hit 0, page 2 loads and prepends — and because nothing moved the
 * scroller afterwards, `scrollTop` is still 0. A scroller already at 0 emits no
 * further scroll events no matter how hard you scroll up, so `loadMore` was
 * never called again. Measured on a channel of 832 messages: exactly 100 rows
 * reachable, unchanged across twenty scroll-to-top attempts, while the server
 * happily served pages 3 and 4 on request.
 *
 * The "Load previous messages" button was the only thing keeping the rest of
 * the history reachable at all.
 *
 * Two changes fix it, and both are needed:
 *
 * 1. **A threshold, not an equality.** `<= LOAD_THRESHOLD_PX` gives the trigger
 *    somewhere to fire from, and starts the fetch just before the user arrives.
 * 2. **Scroll anchoring.** Prepending grows the content above the viewport;
 *    without restoring the offset the view jumps to the new top, which is both
 *    the visible bug and the thing that pinned `scrollTop` at 0. Restoring it
 *    moves the scroller off 0, so the next scroll-up can trigger again.
 *
 * @param count total rendered messages — the signal that a page landed.
 */

/** Start loading slightly before the top, so history is usually already there. */
const LOAD_THRESHOLD_PX = 200;

export function useCommunityScroll({
    chatRef,
    bottomRef,
    shouldLoadMore,
    loadMore,
    count,
}: CommunityScrollProps) {
    const [hasInitialized, setHasInitialized] = useState(false);

    // scrollHeight/scrollTop captured when a load starts, so the restore below
    // knows how far the content grew. Doubles as the in-flight flag: scroll
    // events fire many times per gesture, and React has not re-rendered with
    // `isFetchingNextPage` yet, so `shouldLoadMore` alone would let one gesture
    // fire several fetches for the same cursor.
    const anchor = useRef<{ height: number; top: number } | null>(null);

    useEffect(() => {
        const el = chatRef?.current;
        if (!el) return;

        const handleScroll = () => {
            if (anchor.current || !shouldLoadMore) return;
            if (el.scrollTop > LOAD_THRESHOLD_PX) return;
            anchor.current = { height: el.scrollHeight, top: el.scrollTop };
            loadMore();
        };

        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, [shouldLoadMore, loadMore, chatRef]);

    // Restore the reading position once the older page has rendered.
    //
    // useLayoutEffect so the correction lands in the same frame as the new rows
    // and is never seen. It must also run BEFORE the auto-scroll effect below
    // reads `distanceFromBottom`, which layout effects do.
    useLayoutEffect(() => {
        const el = chatRef?.current;
        const pending = anchor.current;
        if (!el || !pending) return;

        const grew = el.scrollHeight - pending.height;
        // Only a positive delta is a prepend. Clearing on any count change
        // regardless is deliberate: if the fetch failed, the height is
        // unchanged and holding the anchor would block loading forever.
        if (grew > 0) el.scrollTop = pending.top + grew;
        anchor.current = null;
    }, [count, chatRef]);

    // Belt and braces: a fetch that errors never changes `count`, so the effect
    // above never runs and the anchor would latch. `shouldLoadMore` flips back
    // to true when `isFetchingNextPage` clears, success or failure.
    useEffect(() => {
        if (shouldLoadMore) anchor.current = null;
    }, [shouldLoadMore]);

    // Auto-scroll to bottom on new messages / initial load.
    useEffect(() => {
        const bottomDiv = bottomRef?.current;
        const topDiv = chatRef.current;

        const shouldAutoScroll = () => {
            if (!hasInitialized && bottomDiv) {
                setHasInitialized(true);
                return true;
            }

            if (!topDiv) return false;

            // Loading OLDER messages leaves us at the top, so this is large and
            // the jump-to-bottom correctly doesn't fire.
            const distanceFromBottom =
                topDiv.scrollHeight - topDiv.scrollTop - topDiv.clientHeight;
            return distanceFromBottom <= 100;
        };

        if (shouldAutoScroll()) {
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        }
    }, [bottomRef, chatRef, count, hasInitialized]);
}
