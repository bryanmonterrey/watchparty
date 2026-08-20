"use client";

import dynamic from "next/dynamic";
import { FeedSurfaceLoading } from "./feed-skeleton";

// BrowseFeed loads LAZY here, exactly as home's feed overlay already loads it
// (home-page-surface.tsx) — not statically. The static import made the
// 800-line feed graph part of /feed's page chunk, i.e. part of what a
// navigation had to download AND parse before the destination could render;
// on /home -> /feed that parse was the visible freeze. Split out, the page
// chunk is this shell plus a skeleton, the navigation commits instantly, and
// the feed streams in behind it. ssr:false costs nothing real: BrowseFeed's
// content is client-fetched, so the server was only ever rendering its empty
// states anyway.
const BrowseFeed = dynamic(
    () => import("./browse-feed").then((module) => module.BrowseFeed),
    { ssr: false, loading: () => <FeedSurfaceLoading /> },
);

export function DiscoverClient() {
    return <BrowseFeed />;
}
