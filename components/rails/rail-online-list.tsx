"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { cn, compactCount } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { useAuthSession } from "@/hooks/use-auth-session";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";

// The Online tab's content, shared by every rail that has the tab — home, the
// video page and the live page render this same list.
//
// Twitch/Kick's who's-online anatomy: a "following" section (the viewer's
// channels, live first with viewer counts, then offline), then "recommended"
// (live channels they don't follow). Rows are avatar + name + category with the
// count pinned right — people, not thumbnails, which is what separates this tab
// from the video lists around it.
//
// Every row navigates to the channel's profile — a stream is a state of its
// host's profile, so there is nothing to select in place, even on home's rail
// where the video rows pick the hero instead of linking.

const INITIAL_VISIBLE = 5;
const SKELETON_COUNT = 6;

interface OnlineChannel {
    userId: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    verifiedTier: string | null;
    isLive: boolean;
    category: string | null;
    viewerCount: number;
}

function ChannelRow({ channel }: { channel: OnlineChannel }) {
    return (
        <Squircle asChild radius={12} autoEffects={false}>
            <Link
                href={`/${channel.username ?? ""}`}
                className="flex w-full items-center gap-3 p-2 transition-colors hover:bg-sidebar-hover-35/60"
            >
                <span className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={channel.avatar_url || "/avatar.png"}
                        alt=""
                        loading="lazy"
                        // Offline channels sit dimmed and desaturated, so the
                        // live ones read at a glance without any extra mark.
                        className={cn("size-full object-cover", !channel.isLive && "opacity-60 grayscale")}
                    />
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-sm font-bold text-flexwhite/95">
                            {channel.name || channel.username}
                        </span>
                        {channel.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-3.5 shrink-0" />}
                        {channel.verifiedTier === "business" && <BusinessBadgeIcon className="size-3.5 shrink-0" />}
                        {channel.verifiedTier === "government" && <GovBadgeIcon className="size-3.5 shrink-0" />}
                    </span>
                    {channel.isLive && channel.category && (
                        <span className="truncate text-sm text-zinc-500">{channel.category}</span>
                    )}
                </span>

                {channel.isLive ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-flexwhite/90">
                        <span className="size-2 rounded-full bg-red1" />
                        {compactCount(channel.viewerCount)}
                    </span>
                ) : (
                    <span className="shrink-0 text-sm font-medium text-zinc-500">offline</span>
                )}
            </Link>
        </Squircle>
    );
}

function Section({
    label,
    channels,
    className,
}: {
    label: string;
    channels: OnlineChannel[];
    className?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    if (channels.length === 0) return null;
    const visible = expanded ? channels : channels.slice(0, INITIAL_VISIBLE);
    return (
        <section className={cn("flex flex-col", className)}>
            <h3 className="px-2 pb-1 text-base font-bold text-flexwhite/95">{label}</h3>
            {visible.map((c) => (
                <ChannelRow key={c.userId} channel={c} />
            ))}
            {channels.length > INITIAL_VISIBLE && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="cursor-pointer px-2 py-1.5 text-left text-sm font-medium text-zinc-500 transition-colors hover:text-white"
                >
                    {expanded ? "show less" : "show more"}
                </button>
            )}
        </section>
    );
}

export function RailOnlineList() {
    const { data: session } = useAuthSession();

    // Signed out there is no following — the query stays off and the list is
    // just the recommended section, same as Twitch logged out.
    const following = trpc.stream.followedChannels.useQuery(
        { limit: 40 },
        { enabled: !!session?.user, staleTime: 30_000, refetchInterval: 60_000 },
    );
    const live = trpc.stream.listLive.useQuery(
        { limit: 12 },
        { staleTime: 30_000, refetchInterval: 60_000 },
    );

    const followed = following.data ?? [];
    const followedIds = useMemo(() => new Set(followed.map((c) => c.userId)), [followed]);

    // Recommended = live minus anyone already in the following section (and the
    // viewer themself) — one channel must not appear in both lists.
    const recommended = useMemo<OnlineChannel[]>(
        () =>
            (live.data ?? [])
                .filter((s) => !followedIds.has(s.userId) && s.userId !== session?.user?.id)
                .map((s) => ({
                    userId: s.userId,
                    name: s.name,
                    username: s.username,
                    avatar_url: s.avatar_url,
                    verifiedTier: s.verifiedTier,
                    isLive: true,
                    category: s.category,
                    viewerCount: s.viewerCount,
                })),
        [live.data, followedIds, session?.user?.id],
    );

    if (following.isLoading || live.isLoading) {
        return (
            <div className="flex flex-col pt-1">
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                    <OnlineRowSkeleton key={i} index={i} count={SKELETON_COUNT} />
                ))}
            </div>
        );
    }

    if (followed.length === 0 && recommended.length === 0) {
        return <p className="px-2 py-8 text-center text-sm font-medium text-zinc-500">no one is live right now</p>;
    }

    return (
        <div className="flex flex-col pb-2">
            <Section label="following" channels={followed} className="pt-1" />
            <Section
                label="recommended"
                channels={recommended}
                className={followed.length > 0 ? "pt-4" : "pt-1"}
            />
        </div>
    );
}

/** Same geometry as a real row — avatar disc, two text lines, the count slot. */
function OnlineRowSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className="flex w-full items-center gap-3 p-2">
            <span className="size-9 shrink-0 rounded-full shimmer-skeleton" style={pulse} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="h-3.5 w-24 rounded-xs shimmer-skeleton" style={pulse} />
                <span className="h-3 w-16 rounded-xs shimmer-skeleton" style={pulse} />
            </span>
            <span className="h-3 w-8 shrink-0 rounded-xs shimmer-skeleton" style={pulse} />
        </div>
    );
}
