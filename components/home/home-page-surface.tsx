"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { HomeCenterColumn } from "./home-center-column";
import { HomeRailTabs } from "./home-rail-tabs";
import { HomeRailVideos } from "./home-rail-videos";
import { HomeActionDock } from "./home-action-dock";
import { ClipsOverlay } from "./clips-overlay";
import { useHomeFeedOverlay } from "@/hooks/use-home-feed-overlay";

const RAIL_INNER = "sticky top-0 flex h-[100svh] flex-col md:pt-[calc(var(--header-height)+2px)]";
// No divider on this side — the left rail carries the only one (border-r, see
// home-left-rail), and it sits on the rail rather than on the list inside so it
// runs the full 100svh rather than stopping where the list does.
const RAIL_INNER_RIGHT = `${RAIL_INNER} gap-2`;

const BrowseFeed = dynamic(
    () => import("@/components/browse/browse-feed").then((module) => module.BrowseFeed),
    { ssr: false, loading: () => <FeedSurfaceLoading /> },
);

function FeedSurfaceLoading() {
    return (
        <div className="flex flex-col">
            <div className="sticky top-[var(--header-height)] h-13 bg-canvas" />
            {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="border-b border-soft-gray/10 p-4">
                    <div className="flex gap-3">
                        <div className="size-11 rounded-full shimmer-skeleton" />
                        <div className="flex-1 space-y-3">
                            <div className="h-3.5 w-2/5 rounded-full shimmer-skeleton" />
                            <div className="h-3.5 w-4/5 rounded-full shimmer-skeleton" />
                            {index % 2 === 1 && <div className="aspect-video w-full rounded-xl shimmer-skeleton" />}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function DiscoverFeedSurface() {
    return (
        <div className="min-h-screen w-full bg-canvas md:pt-[var(--header-height)]">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="relative mx-auto min-h-screen w-full max-w-[628px] border-x border-soft-gray/[0.12]"
            >
                <BrowseFeed headerOffset />
            </motion.div>
        </div>
    );
}

export function HomePageSurface() {
    const feedOpen = useHomeFeedOverlay((state) => state.open);
    const closeFeed = useHomeFeedOverlay((state) => state.onClose);
    const previousScroll = useRef(0);
    const wasOpen = useRef(false);

    useLayoutEffect(() => {
        const scroller = document.getElementById("app-scroll-container");
        if (!scroller) return;

        if (feedOpen && !wasOpen.current) {
            previousScroll.current = scroller.scrollTop;
            scroller.scrollTo({ top: 0, behavior: "instant" });
        } else if (!feedOpen && wasOpen.current) {
            scroller.scrollTo({ top: previousScroll.current, behavior: "instant" });
        }
        wasOpen.current = feedOpen;
    }, [feedOpen]);

    useEffect(() => {
        if (!feedOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeFeed();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [closeFeed, feedOpen]);

    useEffect(() => () => closeFeed(), [closeFeed]);

    if (feedOpen) return <DiscoverFeedSurface />;

    return (
        // The alerts rail and the row's px-1 live in (rails)/layout.tsx now —
        // /home, /feed and the token page all mount it from there. What's left
        // here is home's own columns, which sit in the space the layout gives
        // this page.
        <div className="relative flex min-h-screen w-full min-w-0">
            {/* Rides the app scroller — the hero scrolls away and the tabs and
                column labels pin as you go down, which is the point. The fill
                those bars need while stuck is applied only once they ARE stuck
                (see useStuck), so unstuck they stay transparent and the hero's
                ambient glow reads through them. */}
            {/* xl:pr-3 opens the gap between this column and the video rail.
                Scoped to xl because that's the only size the rail exists at —
                below it the padding would just inset the column against nothing.
                Padding rather than a narrower column: the hero and everything
                under it size off <main>, so this pulls them all in together. */}
            <main className="@container/home relative flex min-w-0 flex-1 flex-col md:mt-[var(--header-height)] pl-3 xl:pr-3">
                <HomeCenterColumn />
            </main>

            <aside className="hidden w-74 shrink-0 xl:block">
                <div className={RAIL_INNER_RIGHT}>
                    <HomeRailTabs />
                    <HomeRailVideos />
                </div>
            </aside>

            {/* 4th column. Its width comes out of <main> (flex-1), so the video
                rail above keeps its w-75 and only the centre column narrows. */}
            <HomeActionDock />

            <ClipsOverlay />
        </div>
    );
}
