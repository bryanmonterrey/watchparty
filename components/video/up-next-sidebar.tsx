"use client";

import { useState } from "react";
import { RailTabs, RAIL_ICON_TAB } from "@/components/rails/rail-tabs";
import { RailVideoList } from "@/components/rails/rail-video-list";
import { RailCard, RAIL_ASIDE, RAIL_INNER } from "@/components/rails/rail-card";

// The video page's right rail — home's rail, same tabs, same rows, same card.
//
// That claim was only half-true until now: the tabs and rows were shared, but
// this rendered them LOOSE at 340px while home wrapped them in a bordered
// squircle at 384px. RailCard is that card and RAIL_ASIDE that width, so the
// two can't drift again.
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
        <aside className={RAIL_ASIDE}>
            <div className={RAIL_INNER}>
                <RailCard tabs={<RailTabs active={tab} onChange={setTab} />}>
                    <RailVideoList tab={tab} excludePostId={postId} />
                </RailCard>
            </div>
        </aside>
    );
}
