"use client";

import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import * as React from "react";
import { LevelBadge } from "./level-badge";
import { BadgeStrip } from "./badge-strip";
import { FollowersFollowingDialog } from "./followers-following-dialog";
import { ProfileHeaderActions } from "./profile-header-actions";
import { CreatorCoinAction } from "./creator-coin-action";
import { SocialLinksRow } from "./social-links";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";

interface ProfileHeaderProps {
    user: UserType;
    isMinimized?: boolean;
    /** Server-fetched seed — kills the counts-only second skeleton phase on the
        profile page. Video/stream headers omit it and keep the shimmer. */
    initialFollowCounts?: { followers: number; following: number };
    /**
     * Makes the display name the switch between this host's stream and their
     * profile — the two views share this header, so the name is the one control
     * that's in the same place in both. Absent, the name is inert text and gets
     * no hover underline, because there'd be nothing to switch to.
     */
    onNameClick?: () => void;
    /** Tooltip for the switch — which way it goes depends on the side calling. */
    nameTitle?: string;
    /** Live pill beside the name. The profile side sets it, so the name reads as
     *  "there's a stream through here"; the stream side already says so itself. */
    showLivePill?: boolean;
}

// Hidden for now: the XP level bar and the badge strip. Flip to true to bring
// both back — the markup and its loading skeleton are left intact below.
const SHOW_LEVEL_AND_BADGES = false;

export function ProfileHeader({ user, isMinimized, initialFollowCounts, onNameClick, nameTitle, showLivePill }: ProfileHeaderProps) {
    const [followersDialog, setFollowersDialog] = React.useState<"followers" | "following" | null>(null);
    const { data: session, isPending: sessionPending } = useAuthSession();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);
    const isOwner = mounted && !sessionPending && session?.user?.id === user.id;
    const { data: counts, refetch: refetchCounts } = trpc.user.followCounts.useQuery(
        { userId: user.id },
        { initialData: initialFollowCounts },
    );
    const { data: card } = trpc.profile.card.useQuery({ userId: user.id }, { enabled: !isMinimized });

    React.useEffect(() => {
        const client = getRealtimeClient();
        const channel = client
            .channel(`follows:${user.id}:${isMinimized ? 'compact' : 'full'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'follows',
                filter: `followingId=eq.${user.id}`,
            }, () => {
                refetchCounts();
            })
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [user.id, refetchCounts]);

    return (
        <div className="flex z-30 flex-1 min-w-0 flex-row justify-between items-start gap-4">
            {/* Identity + stats stack. Even gap-1.5 rhythm between the name,
                level and followers rows — the action buttons are a separate
                column (sibling below) so their h-11 height no longer inflates
                this stack's first row and skews the gaps. */}
            <div className="flex flex-col gap-0.5 min-w-0">
                <div className={cn("flex items-center justify-start min-w-0 flex-row flex-wrap gap-x-1 gap-y-1")}>
                    {onNameClick ? (
                        <button
                            type="button"
                            onClick={onNameClick}
                            title={nameTitle}
                            className={cn(
                                "cursor-pointer font-semibold tracking-tighter text-white underline-offset-4 hover:underline",
                                isMinimized ? "text-xl" : "text-2xl",
                            )}
                        >
                            {user.name}
                        </button>
                    ) : (
                        <h1 className={cn("font-semibold tracking-tighter text-white", isMinimized ? "text-xl" : "text-2xl")}>
                            {user.name}
                        </h1>
                    )}
                    {showLivePill && (
                        <span className="ml-1 flex h-6 items-center gap-1.5 rounded-full bg-pastelred/15 px-2 text-[11px] font-bold uppercase tracking-wide text-pastelred">
                            <span className="relative flex size-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pastelred opacity-60" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-pastelred" />
                            </span>
                            Live
                        </span>
                    )}
                    {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-5.5" />}
                    {user.verifiedTier === "business" && <BusinessBadgeIcon className="size-5.5" />}
                    {user.verifiedTier === "government" && <GovBadgeIcon className="size-5.5" />}
                    <span className="text-zinc-400 tracking-wide font-semibold text-lg">
                        @{user.username}
                    </span>
                    {/* Socials sit inline with the name (compact, quiet) — moved
                        here from the About card so they're visible on every tab. */}
                    {!isMinimized && <SocialLinksRow socials={user.socials} compact className="ml-1" />}
                </div>

                {!isMinimized && SHOW_LEVEL_AND_BADGES && (
                    <div className="flex flex-wrap items-center gap-2.5">
                        <LevelBadge xp={user.xp} userId={user.id} />
                        {!card ? (
                            <div className="flex items-center gap-1.5">
                                <div className="shimmer-skeleton size-[22px] rounded-full" />
                                <div className="shimmer-skeleton size-[22px] rounded-full" />
                                <div className="shimmer-skeleton size-[22px] rounded-full" />
                            </div>
                        ) : (
                            <BadgeStrip badges={card.badges ?? []} />
                        )}
                    </div>
                )}

                {!counts ? (
                    <div className="flex items-center gap-5">
                        <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                        <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                    </div>
                ) : (
                    <div className="flex items-center gap-5 text-sm">
                        <button
                            onClick={() => setFollowersDialog("following")}
                            className="text-white font-bold hover:underline"
                        >
                            {counts.following} <span className="text-zinc-400 font-bold">Following</span>
                        </button>
                        <button
                            onClick={() => setFollowersDialog("followers")}
                            className="text-white font-bold hover:underline"
                        >
                            {counts.followers} <span className="text-zinc-400 font-bold">Followers</span>
                        </button>
                    </div>
                )}

                {/* The coin sits under the follow counts rather than in the
                    action row: it describes the identity (alongside who follows
                    it) rather than being something you do to it. Renders
                    nothing when there's no coin and it isn't yours. */}
                <div className="mt-2 flex">
                    <CreatorCoinAction
                        userId={user.id}
                        isOwner={isOwner}
                        creatorWallet={user.wallet_address ?? null}
                        creatorAvatar={user.avatar_url ?? null}
                    />
                </div>

                <FollowersFollowingDialog
                    userId={user.id}
                    username={user.username ?? undefined}
                    initialTab={followersDialog ?? "followers"}
                    open={followersDialog !== null}
                    onOpenChange={(o) => { if (!o) setFollowersDialog(null); }}
                    isOwnProfile={isOwner}
                    followersCount={counts?.followers ?? 0}
                    followingCount={counts?.following ?? 0}
                />
            </div>

            <ProfileHeaderActions
                user={user}
                isOwner={isOwner}
            />
        </div>
    );
}
