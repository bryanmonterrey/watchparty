"use client";

import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { SocialLinksRow } from "./social-links";
import { WalletCards } from "lucide-react";

// The structured "About {name}" card at the top of the About tab. Kept lean
// on purpose: bio/joined/location/website/followers all live in the profile
// header — this card is the socials + wallet surface the header doesn't show.

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

            {user.wallet_address && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-400">
                    <WalletCards size={15} className="shrink-0 text-zinc-500" />
                    <span className="truncate text-xs">{user.wallet_address}</span>
                </span>
            )}
        </div>
    );
}
