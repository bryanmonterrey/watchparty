"use client";

// Feed autoplay coordinator: at most ONE registered video plays at a time —
// whichever is most visible (above MIN_RATIO). As the feed scrolls, the most
// in-view card plays and the previously-playing one pauses. Used by
// FeedVideoPlayer via an IntersectionObserver per card.
const MIN_RATIO = 0.6;

type Entry = { ratio: number; play: () => void; pause: () => void };
// A Map, NOT a WeakMap, and deliberately: line ~16 iterates it to find the
// best-visible entry, which a WeakMap cannot do. Phase 9e listed this as a leak
// on the grounds that "a WeakMap would collect" — it would also break autoplay.
// Bounded instead by `unregister` deleting on unmount, which is the correct
// shape for something whose keys are live DOM-bound tokens.
const entries = new Map<object, Entry>();
let active: object | null = null;

function recompute() {
    let best: object | null = null;
    let bestRatio = MIN_RATIO;
    for (const [token, e] of entries) {
        if (e.ratio >= bestRatio) {
            bestRatio = e.ratio;
            best = token;
        }
    }
    if (best === active) return;
    const prev = active;
    active = best;
    if (prev) entries.get(prev)?.pause();
    if (active) entries.get(active)?.play();
}

export function reportFeedVisibility(token: object, ratio: number, play: () => void, pause: () => void) {
    entries.set(token, { ratio, play, pause });
    recompute();
}

export function unregisterFeedVideo(token: object) {
    if (active === token) active = null;
    entries.delete(token);
    recompute();
}
