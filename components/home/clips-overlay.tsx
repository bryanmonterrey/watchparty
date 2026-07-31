"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ShortsFeedLoading } from "@/components/shorts/shorts-feed-loading";
import { useClipsOverlay } from "@/hooks/use-clips-overlay";

// Behind interaction, per the speed rule: the shorts feed drags in video players
// (short-video-card, ambient-glow-video), and nobody on /home pays for those
// until Clips opens. The fallback keeps the final layout and uses the app's
// black player screen + spinner convention instead of flashing an empty canvas.
const ShortsFeed = dynamic(
    () => import("@/components/shorts/shorts-feed").then((m) => m.ShortsFeed),
    { ssr: false, loading: () => <ShortsFeedLoading /> },
);

// The Clips tab's surface: the shorts feed, full-bleed over the app.
//
// Modelled on the marketing site's menu overlay (components/marketing/
// site-header.tsx): the canvas is INSTANT — no fade on the fill itself — and
// only the content inside it animates in. Same z-order trick too. z-40 puts this
// UNDER the header's z-50, which is what keeps the search bar and the menu icon
// live while it's open, rather than sealing the app off behind a modal.
//
// bg-canvas, the same fill the sidebar paints — the marketing menu goes to pure
// black, but this one lives inside the app and reads as an app surface. It used
// to reach for `bg-sidebar`, which is a different colour entirely (globals.css).
//
// The header offset is padding, not a top inset: the fill should run edge to edge
// behind the header band, and only the feed needs to clear it.
export function ClipsOverlay() {
    const { open, onClose } = useClipsOverlay();

    // Escape closes, same as the marketing menu. The header's X is the visible
    // affordance; this is for people who never touch it.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 bg-canvas md:pt-[var(--header-height)]">
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="h-full w-full"
            >
                <ShortsFeed />
            </motion.div>
        </div>
    );
}
