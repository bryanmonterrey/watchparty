"use client";

import { UserType } from "@/db/schema/auth/user";
import { HomeVideosRow } from "./home-videos-row";
import { HomeCoinsRow } from "./home-coins-row";

// The channel Home tab (Twitch/Kick model): a recap surface — content rows,
// each a self-contained module; add future rows (clips, coins, categories)
// as siblings here. The live/offline HomeHero is hidden for now — re-add
// <HomeHero user={user} onWatch={...} /> above the rail to bring it back.

export function ProfileHome({ user, onTabChange }: {
    user: UserType;
    onTabChange?: (tab: string) => void;
}) {
    return (
        <div className="flex flex-col gap-10">
            <HomeVideosRow user={user} onViewAll={() => onTabChange?.("Videos")} />
            <HomeCoinsRow userId={user.id} onViewAll={() => onTabChange?.("Coins")} />
        </div>
    );
}
