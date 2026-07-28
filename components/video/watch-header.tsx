"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserType } from "@/db/schema/auth/user";
import { WatchActions } from "./watch-actions";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";

// The header under the screen on the video and live pages — home's video header
// applied to a full page.
//
// Shape: avatar | title, @username, token row | actions over the view/viewer
// count. Three differences from home's, all deliberate:
//
//   · the avatar is size-24 and ringless, owned here rather than passed in, so
//     the two pages cannot drift apart again
//   · @username is set at the TITLE's size, so the identity reads as the
//     second line of one block instead of a caption under it
//   · the count sits bottom-right beneath the actions, not inline in a meta row
//
// It replaces ProfileHeader on both pages. That component is built for a
// profile — display name, follower counts, level and badges — and stacking all
// of it under a video title was the reason these headers felt like a different
// app from home. The action row is WatchActions: gift, follow-or-subscribe,
// heart, dots.

interface WatchHeaderProps {
    user: UserType;
    title: string;
    /** The heart, when the page has something likeable. See WatchActions. */
    like?: { liked: boolean; onToggle: () => void };
    /** Bottom right: "4 views · yesterday", or the live viewer + duration chips. */
    stats?: ReactNode;
    /** Third row, under the identity — <TokenRow />, the same coin line home's
     *  video header runs. */
    tokenRow?: ReactNode;
    /**
     * Live page: the username switches back to the profile instead of navigating
     * to it. Both readings are "go to this person", so it's the same control.
     */
    onNameClick?: () => void;
    nameTitle?: string;
}

function VerifiedBadge({ tier }: { tier: string | null | undefined }) {
    if (tier === "verified") return <VerifiedBadgeIcon className="size-5 shrink-0" />;
    if (tier === "business") return <BusinessBadgeIcon className="size-5 shrink-0" />;
    if (tier === "government") return <GovBadgeIcon className="size-5 shrink-0" />;
    return null;
}

export function WatchHeader({ user, title, like, stats, tokenRow, onNameClick, nameTitle }: WatchHeaderProps) {
    const nameClass = "truncate text-[20px] font-bold leading-snug text-zinc-400 transition-colors hover:text-white";

    return (
        <div className="mt-3 flex items-start gap-4">
            {/* The header owns the avatar rather than taking it as a prop: the
                two pages were passing different components at different sizes
                (size-20 video, size-24 live) and that's the whole reason they
                didn't match. size-24 for both, and NO border/ring — the 6px
                black ring those components draw is for an avatar overlapping a
                banner, which is the profile page's problem, not this one.
                (components/profile/profile-avatar keeps its ring for exactly
                that reason; it's still the profile page's.) */}
            <Link href={`/${user.username ?? ""}`} className="shrink-0" aria-label={user.username ?? "creator"}>
                <Avatar className="size-24">
                    <AvatarImage src={user.avatar_url ?? undefined} className="object-cover" />
                    <AvatarFallback />
                </Avatar>
            </Link>

            {/* Identity: title, then the handle at the same size under it. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h1 className="line-clamp-2 text-[20px] font-bold leading-snug text-white">{title}</h1>

                <div className="flex min-w-0 items-center gap-x-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                        {onNameClick ? (
                            <button
                                type="button"
                                onClick={onNameClick}
                                title={nameTitle}
                                className={`${nameClass} cursor-pointer underline-offset-4 hover:underline`}
                            >
                                @{user.username}
                            </button>
                        ) : (
                            <Link href={`/${user.username ?? ""}`} className={nameClass}>
                                @{user.username}
                            </Link>
                        )}
                        <VerifiedBadge tier={user.verifiedTier} />
                    </span>
                </div>

                {tokenRow && <div className="mt-1">{tokenRow}</div>}
            </div>

            {/* Actions, with the count beneath them at the bottom right. */}
            <div className="flex shrink-0 flex-col items-end gap-2">
                <WatchActions user={user} like={like} />
                {stats && <div className="flex items-center gap-x-1.5 text-[16px] font-semibold text-zinc-400">{stats}</div>}
            </div>
        </div>
    );
}
