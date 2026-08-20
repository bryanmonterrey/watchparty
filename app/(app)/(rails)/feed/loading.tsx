import { FeedSurfaceLoading } from "@/components/browse/feed-skeleton";

// The instant shell for /feed — the counterpart of home/loading.tsx, and the
// fix for the navigation that FROZE instead of showing anything.
//
// /feed had no loading boundary, so a navigation could not commit until the
// page's entire client graph (BrowseFeed and its 20 imports) had downloaded,
// parsed and rendered — the router held the OLD page for all of it, which on a
// loaded machine reads as "the page became unresponsive and /feed took
// forever". With this file the commit is immediate: the RSC payload carries
// the boundary, the frame comes from feed/layout.tsx (FeedFrame renders the
// right rail and dock around this slot), and the feed chunk lands into an
// already-painted column.
//
// Only the column's content belongs here — FeedFrame supplies everything
// around the children slot, so a frame element repeated here would
// double-render.
export default function FeedLoading() {
    return <FeedSurfaceLoading />;
}
