"use client"

// Which create-dialog steps are code-split, in one place.
//
// The dialog's other tabs (video, post, coin) are composed inline from
// components the app already ships. These two are whole surfaces that exist for
// one tab each and drag real weight behind them — stream setup pulls the
// connection/keys/OBS flow, space setup pulls the cashtag picker and its
// autocomplete — so neither is paid for until someone opens that tab.
//
// They live here rather than beside the dialog's own state because the dialog
// is already well past the file-size guard's line, and "what is lazy" is a
// decision worth being able to read on its own.

import dynamic from "next/dynamic"

// Both steps sit in the same slot, so they share one placeholder — the dialog
// reserves min-h-[350px] for this content area either way.
const StepFallback = () => (
    <div className="flex h-[350px] items-center justify-center">
        <div className="h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
    </div>
)

export const LazyStreamSetup = dynamic(
    () => import("./stream-setup").then((m) => m.StreamSetup),
    { ssr: false, loading: StepFallback },
)

export const LazySpaceSetup = dynamic(
    () => import("./space-setup").then((m) => m.SpaceSetup),
    { ssr: false, loading: StepFallback },
)
