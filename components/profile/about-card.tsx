"use client";

import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { SocialLinksRow } from "./social-links";

// The structured "About {name}" card at the top of the About tab. Kept lean
// on purpose: bio/joined/location/website/followers all live in the profile
// header. No wallet address — addresses are never displayed in the UI
// (owner rule, 2026-07-21).

export function AboutCard({ user }: { user: UserType }) {
    return (
        <div className="flex flex-col gap-4 rounded-[20px] bg-panel p-6 ring-1 ring-panel">
            <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
                About {user.name}
                {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-5" />}
                {user.verifiedTier === "business" && <BusinessBadgeIcon className="size-5" />}
                {user.verifiedTier === "government" && <GovBadgeIcon className="size-5" />}
            </h2>

            <SocialLinksRow socials={user.socials} />
        </div>
    );
}
