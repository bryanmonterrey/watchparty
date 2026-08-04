"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserType } from "@/db/schema/auth/user";
import { WatchActions, type WatchPost } from "./watch-actions";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";

// The header under the screen on the video and live pages — home's video header
// applied to a full page.
//
// Shape: avatar | title, @username, token row | actions over the view/viewer
// count. Three differences from home's, all deliberate:
//
//   · the avatar is size-16 and ringless, owned here rather than passed in, so
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
    /** The post being watched — drives comment/repost/heart. See WatchActions. */
    post?: WatchPost;
    /** Row layout knobs, forwarded to WatchActions. */
    followFirst?: boolean;
    giftSubs?: boolean;
    /** Bottom right: "4 views · yesterday", or the live viewer + duration chips. */
    stats?: ReactNode;
    /**
     * Third row, under the identity. Empty on both pages now — the coin's ticker
     * pill was removed from the headers and its Launch/Buy moved into `stats`.
     * The slot stays because the row is generic, not because anything fills it.
     */
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

export function WatchHeader({ user, title, post, stats, tokenRow, onNameClick, nameTitle, followFirst, giftSubs }: WatchHeaderProps) {
    const nameClass = "truncate text-[20px] font-bold leading-snug text-zinc-400 transition-colors hover:text-white";

    return (
        <div className="mt-3 flex items-start gap-4 px-3">
            {/* The header owns the avatar rather than taking it as a prop: the
                two pages were passing different components at different sizes
                (size-20 video, size-24 live) and that's the whole reason they
                didn't match. size-16 for both, and NO border/ring — the 6px
                black ring those components draw is for an avatar overlapping a
                banner, which is the profile page's problem, not this one.
                (components/profile/profile-avatar keeps its ring for exactly
                that reason; it's still the profile page's.) */}
            <Link href={`/${user.username ?? ""}`} className="shrink-0" aria-label={user.username ?? "creator"}>
                <Avatar className="size-16">
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
            <div className="flex shrink-0 flex-col items-end gap-3.5">
                <WatchActions user={user} post={post} followFirst={followFirst} giftSubs={giftSubs} />
                {stats && <div className="flex items-center gap-x-1.5 text-[16px] font-medium text-zinc-400">{stats}</div>}
            </div>
        </div>
    );
}

/**
 * Loading twin of WatchHeader — same file, on purpose.
 *
 * The video and live pages each hand-rolled their own header skeleton, and both
 * still traced the layout WatchHeader REPLACED: a title bar stacked above the
 * row (the title is beside the avatar now), an avatar at size-20 (video) vs
 * w-24 h-24 (live) wearing the profile page's `border-[6px] border-black` ring
 * (this header's avatar is ringless), and h-9 action pills (they're h-11, per
 * the button standard). So the two pages disagreed with the real header and
 * with each other — the exact drift the note at the top of this file says the
 * shared avatar exists to prevent.
 *
 * One skeleton, next to the component it mirrors, so it can't drift again.
 * Every number below is read off the real markup above: gap-4/px-3/mt-3 frame,
 * size-16 avatar, gap-0.5 identity column, gap-3.5 action column, gap-2 between
 * action buttons.
 */
export function WatchHeaderSkeleton({
    /** Reserve the coin pill's row — pass what you pass `tokenRow`. */
    tokenRow = false,
    /** Reserve the bottom-right stats line (views / viewer + duration chips). */
    stats = true,
}: { tokenRow?: boolean; stats?: boolean } = {}) {
    return (
        <div className="mt-3 flex items-start gap-4 px-3">
            {/* size-16, ringless — matches the Avatar above exactly. */}
            <div className="size-16 shrink-0 rounded-full shimmer-skeleton" />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* Title and @username are BOTH text-[20px] leading-snug, so each
                    occupies a 27.5px line box — h-7 wrappers hold that height and
                    centre a shorter bar, so nothing shifts when the text lands. */}
                <div className="flex h-7 items-center">
                    <div className="h-5 w-2/3 max-w-100 rounded-xs shimmer-skeleton" />
                </div>
                <div className="flex h-7 items-center">
                    <div className="h-4.5 w-36 rounded-xs shimmer-skeleton" />
                </div>
                {tokenRow && (
                    // TokenRow size="lg" is a py-1 pill around 14px text.
                    <div className="mt-1 h-7 w-40 rounded-full shimmer-skeleton" />
                )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-3.5">
                {/* WatchActions: one text pill (Follow/Subscribe) plus icon
                    buttons — h-11 / size-11, gap-2, all rounded-full. */}
                <div className="flex items-center gap-2">
                    <div className="h-11 w-28 rounded-full shimmer-skeleton" />
                    <div className="size-11 rounded-full shimmer-skeleton" />
                    <div className="size-11 rounded-full shimmer-skeleton" />
                    <div className="size-11 rounded-full shimmer-skeleton" />
                </div>
                {stats && (
                    <div className="flex h-6 items-center">
                        <div className="h-4 w-32 rounded-xs shimmer-skeleton" />
                    </div>
                )}
            </div>
        </div>
    );
}
