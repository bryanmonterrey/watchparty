import { useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";

// Tracks how long each feed card is actually visible (dwell time) and batches
// it to the Phoenix ranker via feed.recordDwell. Dwell is one of X's strongest
// implicit signals — a post you linger on without liking still tells the model
// you cared.
//
// Usage in a feed list:
//   const dwell = useFeedDwell("home");
//   ...
//   <article ref={dwell.track({ subjectId: post.id, authorId: post.userId })}>
//
// Ref callbacks are cached per subjectId so their identity is stable across
// renders (otherwise React would detach/reattach every render and reset timing).

interface CardMeta {
    subjectId: string;
    subjectType?: "post" | "stream";
    authorId?: string;
}

interface TrackedCard extends CardMeta {
    visibleSince: number | null; // ms timestamp while visible, else null
    accumulated: number; // unflushed visible seconds
}

const VISIBILITY_THRESHOLD = 0.5; // ≥50% on screen counts as "visible"
const FLUSH_INTERVAL_MS = 15_000;

export function useFeedDwell(surface: string = "home") {
    // feedRouter is merged into the `content` namespace (see server/routers/index.ts).
    const recordDwell = trpc.content.recordDwell.useMutation();
    const observer = useRef<IntersectionObserver | null>(null);
    const cards = useRef(new Map<Element, TrackedCard>());
    const elements = useRef(new Map<string, Element>()); // subjectId → element
    const callbacks = useRef(new Map<string, (el: Element | null) => void>());

    // Settle currently-visible time into `accumulated` (called on flush + on hide).
    const settle = useCallback((el: Element, now: number) => {
        const c = cards.current.get(el);
        if (c && c.visibleSince != null) {
            c.accumulated += (now - c.visibleSince) / 1000;
            c.visibleSince = now;
        }
    }, []);

    const flush = useCallback(() => {
        const now = Date.now();
        const items: Array<{
            subjectId: string;
            subjectType: "post" | "stream";
            authorId?: string;
            seconds: number;
            surface: string;
        }> = [];
        for (const [el, c] of cards.current) {
            settle(el, now);
            if (c.accumulated >= 1) {
                items.push({
                    subjectId: c.subjectId,
                    subjectType: c.subjectType ?? "post",
                    authorId: c.authorId,
                    seconds: Math.round(c.accumulated),
                    surface,
                });
                c.accumulated = 0;
            }
        }
        // recordDwell caps at 50 items/call; chunk if a long list settles at once.
        for (let i = 0; i < items.length; i += 50) {
            recordDwell.mutate({ items: items.slice(i, i + 50) });
        }
    }, [recordDwell, settle, surface]);

    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return;
        const obs = new IntersectionObserver(
            (entries) => {
                const now = Date.now();
                for (const entry of entries) {
                    const c = cards.current.get(entry.target);
                    if (!c) continue;
                    const visible = entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD;
                    if (visible && c.visibleSince == null) {
                        c.visibleSince = now;
                    } else if (!visible && c.visibleSince != null) {
                        c.accumulated += (now - c.visibleSince) / 1000;
                        c.visibleSince = null;
                    }
                }
            },
            { threshold: [0, VISIBILITY_THRESHOLD, 1] }
        );
        observer.current = obs;
        // Observe any cards registered before the observer existed.
        for (const el of cards.current.keys()) obs.observe(el);

        const interval = setInterval(flush, FLUSH_INTERVAL_MS);
        const onHide = () => { if (document.visibilityState === "hidden") flush(); };
        document.addEventListener("visibilitychange", onHide);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onHide);
            flush();
            obs.disconnect();
            observer.current = null;
        };
    }, [flush]);

    const track = useCallback((meta: CardMeta) => {
        const key = meta.subjectId;
        let cb = callbacks.current.get(key);
        if (!cb) {
            cb = (el: Element | null) => {
                const prev = elements.current.get(key);
                if (prev && prev !== el) {
                    settle(prev, Date.now());
                    cards.current.delete(prev);
                    elements.current.delete(key);
                    observer.current?.unobserve(prev);
                }
                if (el) {
                    elements.current.set(key, el);
                    cards.current.set(el, { ...meta, visibleSince: null, accumulated: 0 });
                    observer.current?.observe(el);
                }
            };
            callbacks.current.set(key, cb);
        }
        return cb;
    }, [settle]);

    return { track };
}
