"use client";

import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, PinpointIcon, CalendarIcon, Link2Icon } from "@/components/icons";
import { WalletCards } from "lucide-react";
import { SocialLinksRow } from "./social-links";
import { trpc } from "@/lib/trpc/client";

// The structured "About {name}" card at the top of the About tab (the one
// thing on Kick/Twitch about pages that ISN'T user-uploaded art): follower
// count, socials row, bio, and the joined/location/website details.

const formatJoinedDate = (date: Date | null) => {
    if (!date) return "Recently";
    try {
        return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(date));
    } catch {
        return "Recently";
    }
};

export function AboutCard({ user }: { user: UserType }) {
    const { data: counts } = trpc.user.followCounts.useQuery({ userId: user.id });

    return (
        <div className="flex flex-col gap-4 rounded-[20px] bg-[#101011] p-6 ring-1 ring-white/10">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
                    About {user.name}
                    {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-5" />}
                    {user.verifiedTier === "business" && <BusinessBadgeIcon className="size-5" />}
                    {user.verifiedTier === "government" && <GovBadgeIcon className="size-5" />}
                </h2>
                {counts && (
                    <span className="text-sm font-bold text-zinc-500">
                        {counts.followers.toLocaleString()} <span className="font-semibold">followers</span>
                    </span>
                )}
            </div>

            <SocialLinksRow socials={user.socials} />

            {user.bio && (
                <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-300">{user.bio}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-zinc-400">
                <span className="flex items-center gap-1.5">
                    <CalendarIcon width={15} height={15} className="text-zinc-500" />
                    Joined {formatJoinedDate(user.createdAt)}
                </span>
                {user.location && (
                    <span className="flex items-center gap-1.5">
                        <PinpointIcon width={15} height={15} className="text-zinc-500" />
                        {user.location}
                    </span>
                )}
                {user.website && (
                    <a
                        href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-1.5 transition-colors hover:text-white"
                    >
                        <Link2Icon className="size-[15px] text-zinc-500 transition-colors group-hover:text-twitter2" />
                        {user.website.replace(/^https?:\/\//, "")}
                    </a>
                )}
                {user.wallet_address && (
                    <span className="flex min-w-0 items-center gap-1.5">
                        <WalletCards size={15} className="shrink-0 text-zinc-500" />
                        <span className="truncate text-xs">{user.wallet_address}</span>
                    </span>
                )}
            </div>
        </div>
    );
}
