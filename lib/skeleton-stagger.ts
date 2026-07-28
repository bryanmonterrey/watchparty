import type { CSSProperties } from "react";

// Self-contained inline style matching the `.shimmer-skeleton` utility (see
// globals.css) on ANY element — even a plain `bg-*` div — so callers don't need
// the class.
//
// The sweeping highlight band this used to render is GONE (owner call
// 2026-07-28), same as `.shimmer-skeleton`'s: skeletons are a still fill now.
// `index`/`count` are inert as a result — they used to offset each sibling's
// animation phase so a row rippled left-to-right instead of sweeping in unison.
// The signature is kept so the 13 call sites don't have to change, and so the
// ripple is one edit away if it ever comes back.
export function staggerPulse(_index: number, _count: number): CSSProperties {
    return {
        backgroundColor: "color-mix(in oklab, var(--color-soft-gray) 5%, transparent)",
    };
}
