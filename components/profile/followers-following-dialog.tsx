"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { MiniProfile } from "./mini-profile-card";
import { LoadMore } from "@/components/interior/load-more";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";

type TabType = "followers" | "following";

interface FollowersFollowingDialogProps {
    userId: string;
    username?: string;
    initialTab?: TabType;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isOwnProfile?: boolean;
    followersCount?: number;
    followingCount?: number;
}

export function FollowersFollowingDialog({
    userId,
    username,
    initialTab = "followers",
    open,
    onOpenChange,
    isOwnProfile = false,
    followersCount = 0,
    followingCount = 0,
}: FollowersFollowingDialogProps) {
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);

    useEffect(() => {
        if (open) setActiveTab(initialTab);
    }, [open, initialTab]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[70vh] w-full max-w-md flex-col gap-0 overflow-hidden border-none p-0 ring-1 ring-white/10">
                <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
                    <DialogTitle className="text-center text-base font-bold text-white">@{username || "user"}</DialogTitle>
                </DialogHeader>

                {/* Tab bar — underline style, matches ProfileTabs elsewhere in the app */}
                <div className="flex shrink-0 gap-7 border-b border-white/10 px-5">
                    {(["followers", "following"] as TabType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "relative cursor-pointer pb-3 text-sm font-extrabold transition-colors",
                                activeTab === tab ? "text-white" : "text-zinc-500 hover:text-zinc-300",
                            )}
                        >
                            {tab === "followers" ? "Followers" : "Following"}
                            <span className="ml-1.5 font-semibold tabular-nums text-zinc-500">
                                {tab === "followers" ? followersCount : followingCount}
                            </span>
                            {activeTab === tab && (
                                <span className="absolute inset-x-0 bottom-0 h-[2.5px] rounded-full bg-twitter2 shadow-[0_0_10px_rgba(53,142,252,0.5)]" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    <UserList userId={userId} type={activeTab} isOwnProfile={isOwnProfile} onClose={() => onOpenChange(false)} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface UserListProps {
    userId: string;
    type: TabType;
    isOwnProfile: boolean;
    onClose: () => void;
}

function UserList({ userId, type, isOwnProfile, onClose }: UserListProps) {
    const { data, isLoading, fetchNextPage, hasNextPage } =
        trpc.user[type === "followers" ? "getFollowers" : "getFollowing"].useInfiniteQuery(
            { userId, limit: 20 },
            { getNextPageParam: (last) => last.nextCursor }
        );

    const items = data?.pages.flatMap((p) => p.items) ?? [];

    if (isLoading) {
        return (
            <div className="flex flex-col gap-1">
                {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}
            </div>
        );
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-lantern/10">
                    <Users className="size-5 text-lantern" />
                </div>
                <p className="text-sm font-semibold text-zinc-500">
                    {type === "followers"
                        ? isOwnProfile ? "When people follow you, they'll appear here." : "No followers yet."
                        : isOwnProfile ? "When you follow people, they'll appear here." : "Not following anyone yet."}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-0.5">
            {items.map((item) => (
                <UserRow key={item.id} item={item} onClose={onClose} />
            ))}
            <LoadMore
                onLoad={() => fetchNextPage()}
                hasMore={!!hasNextPage}
                className="py-2"
                labels={{ end: "End of the list" }}
            />
        </div>
    );
}

interface UserRowProps {
    item: {
        id: string;
        name: string | null;
        username: string | null;
        avatar_url: string | null;
        bio: string | null;
        verifiedTier: "verified" | "business" | "government" | null;
        isFollowing: boolean;
    };
    onClose: () => void;
}

function UserRow({ item, onClose }: UserRowProps) {
    const { data: session } = useAuthSession();
    const isCurrentUser = session?.user?.id === item.id;
    const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
    const utils = trpc.useUtils();

    const settle = () => {
        setOptimisticFollowing(null);
        utils.user.getFollowers.invalidate();
        utils.user.getFollowing.invalidate();
    };
    const follow = trpc.user.follow.useMutation({
        onMutate: () => setOptimisticFollowing(true),
        onError: () => setOptimisticFollowing(null),
        onSuccess: settle,
    });
    const unfollow = trpc.user.unfollow.useMutation({
        onMutate: () => setOptimisticFollowing(false),
        onError: () => setOptimisticFollowing(null),
        onSuccess: settle,
    });

    const isFollowing = optimisticFollowing ?? item.isFollowing;
    const isPending = follow.isPending || unfollow.isPending;

    const handleToggle = () => {
        if (isFollowing) {
            unfollow.mutate({ followingId: item.id });
            toast.success(`Unfollowed @${item.username}`);
        } else {
            follow.mutate({ followingId: item.id });
            toast.success(`Following @${item.username}`);
        }
    };

    return (
        <div className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-white/5">
            <MiniProfile userId={item.id} triggerClassName="shrink-0">
                <Link href={`/${item.username ?? ""}`} onClick={onClose} className="block size-11 overflow-hidden rounded-full bg-zinc-800">
                    {item.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.avatar_url} alt={item.name ?? ""} className="size-full object-cover" />
                    ) : (
                        <div className="flex size-full items-center justify-center text-sm font-bold text-zinc-500">
                            {(item.name ?? item.username ?? "?")[0]?.toUpperCase()}
                        </div>
                    )}
                </Link>
            </MiniProfile>

            <Link href={`/${item.username ?? ""}`} onClick={onClose} className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                    <p className="truncate text-sm font-bold text-white">{item.name || item.username || ""}</p>
                    {item.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-3.5 shrink-0" />}
                    {item.verifiedTier === "business" && <BusinessBadgeIcon className="size-3.5 shrink-0" />}
                    {item.verifiedTier === "government" && <GovBadgeIcon className="size-3.5 shrink-0" />}
                </div>
                <p className="truncate text-xs font-semibold text-zinc-500">@{item.username}</p>
                {item.bio && <p className="mt-0.5 truncate text-xs text-zinc-500">{item.bio}</p>}
            </Link>

            {!isCurrentUser && (
                <button
                    onClick={handleToggle}
                    disabled={isPending}
                    className={cn(
                        "flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-bold transition-colors",
                        isFollowing
                            ? "border border-white/15 text-zinc-300 hover:border-red-500/40 hover:text-red-400"
                            : "bg-white text-black hover:bg-zinc-100",
                    )}
                >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : isFollowing ? "Following" : "Follow"}
                </button>
            )}
        </div>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 p-2">
            <div className="shimmer-skeleton size-11 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
                <div className="shimmer-skeleton h-3.5 w-28 rounded-full" />
                <div className="shimmer-skeleton h-3 w-20 rounded-full opacity-60" />
            </div>
            <div className="shimmer-skeleton h-11 w-20 shrink-0 rounded-full" />
        </div>
    );
}
