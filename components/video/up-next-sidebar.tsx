"use client";

import { useState } from "react";
import { RailTabs, RAIL_ICON_TAB } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";

// The video page's right rail — home's rail, same tabs, same rows.
//
// It used to run its own tab set (All / From <creator> / Related / Watched) and
// its own row design (192px thumbnail, views + age line). Both are gone in
// favour of the shared rail: the three right rails in the app are meant to read
// as one component in three places.
//
// WORTH KNOWING: "From <creator>" and "Related" went with that change, and they
// were the two tabs specific to watching a video. The queries behind them
// (content.getVideosByUser, content.getRelatedVideos) are untouched and still
// exported — if they come back, they come back as tabs in RAIL_TABS so every
// rail gets them, not as a fork of this one.
interface UpNextSidebarProps {
    /** Kept out of its own up-next list. Everything else the rail needs, it
     *  fetches itself — it no longer waits on the video query. */
    postId: string;
}

export function UpNextSidebar({ postId }: UpNextSidebarProps) {
    const [tab, setTab] = useState(RAIL_ICON_TAB);

    return (
        // 340px is the app's one right-rail width — the profile page's rail and
        // the live page's chat are both on it. gap-4 between the tab row and the
        // list, matching home.
        <div className="hidden-scrollbar sticky top-20 hidden w-[340px] shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
            <RailTabs active={tab} onChange={setTab} />
            <RailVideoList tab={tab} excludePostId={postId} />
        </div>
    );
}
