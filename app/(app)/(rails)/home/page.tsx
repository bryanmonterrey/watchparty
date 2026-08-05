import type { Metadata } from "next";
import { HomeFeedProvider } from "@/components/home/home-feed-context";
import { HomePageSurface } from "@/components/home/home-page-surface";

// Home is a 3-column frame: rails either side of a single content column, one
// native scroll for the whole row.
//
// The LEFT rail is the exception to "no per-column overflow": it hosts the coin
// alert feed, which is unbounded and constantly appending, so it scrolls inside
// its own sticky column instead of stretching the page. The centre column and
// right rail still ride the app scroller.
//
// The old HomeView (desktop/mobile switcher, ssr:false) is retired — mobile
// web is gated by DesktopOnlyGate and the phone experience is the Expo app.
// The previous centre-column content still lives in components/home/
// desktop-home2.tsx (hero + categories + IRL); render <DesktopHome /> inside
// <main> to bring it back.
export const metadata: Metadata = {
    title: "home",
};

export default function AppHome() {
    return (
        <HomeFeedProvider>
            <HomePageSurface />
        </HomeFeedProvider>
    );
}
