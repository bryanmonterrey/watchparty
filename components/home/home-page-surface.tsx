"use client";

import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { HomeCenterColumn } from "./home-center-column";
import { HomeRailVideos } from "./home-rail-videos";
import { NewsCard } from "@/components/browse/discover-right-rail";
import { RailFooter } from "@/components/rails/rail-footer";
import { HomeActionDock } from "./home-action-dock";
import { ClipsOverlay } from "./clips-overlay";
import { FeedSurfaceLoading } from "@/components/browse/feed-skeleton";
import { useHomeFeedOverlay } from "@/hooks/use-home-feed-overlay";
import HomeLoading from "@/app/(app)/(rails)/home/loading";

// h-[calc(100svh-5rem)], not h-[100svh]. The 5rem (80px) is the mb-20 the video
// card used to carry INSIDE this box: the card's own height is
// boxHeight - pt - bottomMargin, so moving that 80px out of the card and off the
// box leaves the card measuring exactly what it did before, while freeing the
// space between the box and the news card to be the feed's 18px gap instead of
// an 80px one.
const RAIL_INNER = "flex h-[calc(100svh-5rem)] flex-col md:pt-[calc(var(--header-height)+2px)]";
// No divider on this side — the left rail carries the only one (border-r, see
// home-left-rail), and it sits on the rail rather than on the list inside so it
// runs the full 100svh rather than stopping where the list does.
//
// SAME HEIGHT AS IT ALWAYS WAS (h-[100svh]) but NO LONGER `sticky top-0`, which
// is what makes the card underneath reachable at all. A sticky box this tall
// covers the whole viewport, and being positioned it paints ABOVE a plain
// sibling — so the news card scrolled up behind it and was never visible. The
// column scrolls as a unit now: rail first at its full height, card after it.
const RAIL_INNER_RIGHT = RAIL_INNER;

const BrowseFeed = dynamic(
    () => import("@/components/browse/browse-feed").then((module) => module.BrowseFeed),
    { ssr: false, loading: () => <FeedSurfaceLoading /> },
);

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
    /* PROGRESSIVE ENTRY — the fix for "/home stalls and skips its loaders".
       The route shell (loading.tsx) paints only while the RSC payload is
       pending, which for this mostly-static page is instants — then the CLIENT
       mount used to render the whole surface in one commit. With warm
       snapshots that commit paints the full board and rails at once, and the
       squircle machinery measures every element against a freshly-written
       clip-path: a profiled ~1s synchronous block, during which the OLD page
       stayed frozen and no loader ever appeared.

       So the mounted page's FIRST commit is the same shell the route serves —
       cheap, paints immediately, pixel-identical to loading.tsx so nothing
       jumps — and the real surface enters in a transition right after. The
       heavy commit still happens, but behind a painted loading frame instead
       of a frozen previous page. */
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        startTransition(() => setEntered(true));
    }, []);

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

    if (!entered) return <HomeLoading />;

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
            {/* THE FEED'S GEOMETRY at rest — same ml-7, same 628px column, same
                28px gap, same w-96 rail. /home and /feed sit under the same
                alerts rail and users move between them constantly, so the centre
                column's LEFT EDGE has to stay on the same vertical when they do.
                ml-7 off the rail is what guarantees that; the column's width is
                free to differ.

                AT xl THE COLUMN TAKES THE ROW'S SLACK (flex-1, no cap). Below
                that it stays capped, because below xl there is no right rail and
                no dock — nothing for the slack to prise apart — and a centre
                column running the full width of a 1100px window is not the feed.

                Above xl there IS something to prise apart, and the cap was what
                did the prising: the row's spare pixels have to go somewhere, and
                with a fixed-width column they went to the rail's mr-auto, which
                slid the rail left and left a hole between it and the dock. Past
                --app-max-width (1536px) that hole is ~100px and permanent, since
                the block stops growing but the columns inside it don't add up to
                it. The column absorbs it now and the rail stays welded to the
                dock — see the aside below, which no longer has mr-auto.

                The hero and everything under it are w-full with no cap of their
                own, so they widen WITH the column rather than leaving the same
                gap one level further in.

                The collapsed-alerts-rail cap swap (w-72 288px -> w-11 44px is
                244px reclaimed, 628 + 244 = 872) is now scoped max-xl:. At xl
                flex-1 absorbs the reclaimed width on its own, and leaving the
                rule unscoped would have QUIETLY BEATEN the xl rule — a
                group-has-[…] selector carries higher specificity than a plain
                responsive class, so it wins regardless of source order. Scoping
                it to a disjoint media query is what keeps the two from
                competing at all. */}
            <main className="@container/home relative flex w-full ml-7 min-w-0 max-w-[628px] flex-col md:mt-[var(--header-height)] max-xl:group-has-[[data-rail-collapsed=true]]/rails:max-w-[872px] xl:max-w-none xl:flex-1">
                <HomeCenterColumn />
            </main>

            {/* ml-7 is the gap from the centre column — measured off the column's
                edge rather than left to whatever width happened to be spare,
                which is what the old xl:pr-3 padding did.

                NO mr-auto. It used to hand the row's slack to the space on this
                rail's RIGHT, which is the same as saying the rail floats and the
                dock is what stays put: at --app-max-width the rail sat ~100px
                clear of the dock with a hole between them, and the wider the
                window the further left it drifted. The centre column takes the
                slack now (xl:flex-1 above), so this aside and the dock are
                always adjacent and the rail is the thing that stays put. */}
            {/* SCROLLS LIKE THE FEED'S THIRD COLUMN — same `sticky bottom-0`
                + `self-end` the feed layout uses, and for the reason it
                documents: the column scrolls up with the page, then pins once
                its bottom edge reaches the viewport bottom, so a column TALLER
                than the viewport reveals its full height as you scroll instead
                of freezing at the top.

                The sticky belongs on the ASIDE, not on the box inside it.
                self-end makes the aside only as tall as its content, so an inner
                sticky has no range to travel; on the aside the containing block
                is the tall page row, which is the range it needs. That's exactly
                what was wrong a moment ago — an inner `sticky top-0` at
                h-[100svh] covered the viewport and, being positioned, painted
                over the news card, so the card could never be reached. */}
            <aside className="sticky bottom-0 ml-7 hidden w-96 shrink-0 self-end xl:block">
                {/* Tabs are no longer a sibling here — they're the card's header,
                    inside HomeRailVideos' RailShell, so the rail reads as one
                    outlined box the way the alerts rail does. */}
                {/* THE VIDEO RAIL KEEPS ITS OWN VIEWPORT-HEIGHT BOX, at exactly
                    the height it has always had. The news card goes after it,
                    not inside it: sharing the h-[100svh] between the two
                    shortened the rail, which was backwards — the COLUMN is what
                    grows. The aside is taller than the viewport now and scrolls
                    as a unit, which is what brings the card into view. */}
                <div className={RAIL_INNER_RIGHT}>
                    <HomeRailVideos />
                </div>

                {/* The feed right rail's card itself, not a lookalike — see the
                    export note on NewsCard. It inherits the aside's w-96, so it
                    matches the rail above it by construction. */}
                {/* mt-[18px] — the same gap the feed's rail puts between its own
                    cards (gap-[18px] on DiscoverRightRail's column), so the two
                    columns space their cards identically. It replaces the video
                    card's old mb-20, which was 80px. */}
                <div className="mt-[18px] flex flex-col pb-8">
                    <NewsCard />
                    {/* The legal footer closes the column, directly under the
                        last card — the only place in the app these pages are
                        reachable from. mt-4 rather than the rail's 18px card
                        gap: it is not a card, so it hangs off the one above it
                        instead of standing as another block. */}
                    <RailFooter className="mt-4" />
                    {/* The SAME h-[50svh] tail the feed's rail ends with
                        (discover-right-rail). It's what carries that column past
                        the bottom of the viewport and gives `sticky bottom-0`
                        something to travel through — without it the column
                        cleared the fold by only the card's height plus pb-20,
                        so there was barely any scroll to feel. Transparent and
                        shrink-0: pure range, it paints nothing. */}
                    <div aria-hidden className="h-[50svh] w-full shrink-0 bg-transparent" />
                </div>
            </aside>

            {/* 4th column, same as the feed's. It sits flush against the rail
                now — the slack is upstream in the centre column, so widening the
                window stretches that and leaves these two where they are. */}
            <HomeActionDock />

            <ClipsOverlay />
        </div>
    );
}
