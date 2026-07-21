"use client";

import { UserType } from "@/db/schema/auth/user";
import { HomeHero } from "./home-hero";
import { HomeVideosRow } from "./home-videos-row";

// The channel Home tab (Twitch/Kick model): a recap surface — live-now /
// latest-upload hero, then content rows. Each row is a self-contained module;
// add future rows (clips, coins, categories) as siblings here.

export function ProfileHome({ user, onTabChange }: {
    user: UserType;
    onTabChange?: (tab: string) => void;
}) {
    return (
        <div className="flex max-w-6xl flex-col gap-10">
            <HomeHero user={user} onWatch={() => onTabChange?.("Streams")} />
            <HomeVideosRow user={user} onViewAll={() => onTabChange?.("Videos")} />
        </div>
    );
}
