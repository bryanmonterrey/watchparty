"use client";

import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, PinpointIcon, CalendarIcon, Link2Icon } from "@/components/icons";
import { SocialLinksRow } from "./social-links";

// The structured "About {name}" card at the top of the About tab. Holds the
// bio + details (location / joined / website) — moved here from the profile
// header (2026-07-24) — plus the socials row. No wallet address — addresses are
// never displayed in the UI (owner rule, 2026-07-21).

const formatJoinedDate = (date: Date | null) => {
    if (!date) return "Recently";
    try {
        const d = typeof date === "string" ? new Date(date) : date;
        return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
    } catch {
        return "Recently";
    }
};

export function AboutCard({ user }: { user: UserType }) {
    return (
        <div className="flex flex-col gap-4 rounded-[20px] bg-panel p-6 ring-1 ring-panel">
            <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
                About {user.name}
                {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-5" />}
                {user.verifiedTier === "business" && <BusinessBadgeIcon className="size-5" />}
                {user.verifiedTier === "government" && <GovBadgeIcon className="size-5" />}
            </h2>

            {user.bio && (
                <p className="max-w-xl text-sm leading-relaxed text-white2">{user.bio}</p>
            )}

            {/* Details — location / joined / website (relocated from the header) */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-zinc-400">
                {user.location && (
                    <div className="flex items-center gap-1 font-bold">
                        <PinpointIcon width={16} height={16} className="text-zinc-400" />
                        {user.location}
                    </div>
                )}

                <div className="flex items-center gap-1 font-bold">
                    <CalendarIcon width={16} height={16} className="text-zinc-400" />
                    Joined {formatJoinedDate(user.createdAt)}
                </div>

                {user.website && (
                    <a
                        href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-1 font-bold transition-colors hover:text-white"
                    >
                        <Link2Icon className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-twitter2" />
                        {user.website.replace(/^https?:\/\//, "")}
                    </a>
                )}
            </div>

            <SocialLinksRow socials={user.socials} />
        </div>
    );
}
