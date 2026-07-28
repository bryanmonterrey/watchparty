"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { UserType } from "@/db/schema/auth/user";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ProfileHeaderActions } from "@/components/profile/profile-header-actions";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";

// The header under the screen on the video and live pages — home's video header
// applied to a full page.
//
// Shape: avatar, then title over @username, with the actions right-aligned and
// the view/viewer count under them at the bottom right. Three differences from
// home's, all deliberate:
//
//   · the avatar is whatever each page already had (size-20 video, size-24
//     live), passed in rather than fixed here
//   · @username is set at the TITLE's size, so the identity reads as the
//     second line of one block instead of a caption under it
//   · the count sits bottom-right beneath the actions, not inline in a meta row
//
// It replaces ProfileHeader on both pages. That component is built for a
// profile — display name, follower counts, level and badges — and stacking all
// of it under a video title was the reason these headers felt like a different
// app from home. Its ACTIONS (gift, message, follow, subscribe) are kept: they
// render here, at the head of each page's own action row.

interface WatchHeaderProps {
    user: UserType;
    title: string;
    /** Each page keeps the avatar it already had. */
    avatar: ReactNode;
    /** Page-specific buttons — like, share, save, overflow. */
    actions?: ReactNode;
    /** Bottom right: "4 views · yesterday", or the live viewer + duration chips. */
    stats?: ReactNode;
    /** Sits beside the username — the video's attached token, on the video page. */
    chip?: ReactNode;
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

export function WatchHeader({ user, title, avatar, actions, stats, chip, onNameClick, nameTitle }: WatchHeaderProps) {
    const { data: session, isPending } = useAuthSession();
    // Mounted-gated like ProfileHeader's own check: the session resolves on the
    // client, so deciding ownership during render would mismatch the server's
    // markup on hydration.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    const isOwner = mounted && !isPending && session?.user?.id === user.id;

    const nameClass = "truncate text-[20px] font-bold leading-snug text-zinc-400 transition-colors hover:text-white";

    return (
        <div className="mt-3 flex items-start gap-4">
            {avatar}

            {/* Identity: title, then the handle at the same size under it. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h1 className="line-clamp-2 text-[20px] font-bold leading-snug text-white">{title}</h1>

                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
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
                    {chip}
                </div>
            </div>

            {/* Actions, with the count beneath them at the bottom right. */}
            <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <ProfileHeaderActions user={user} isOwner={isOwner} />
                    {actions}
                </div>
                {stats && <div className="flex items-center gap-2 text-sm font-semibold text-zinc-400">{stats}</div>}
            </div>
        </div>
    );
}
