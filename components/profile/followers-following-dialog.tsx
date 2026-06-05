"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { UserPlus, UserMinus, Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

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
            <DialogContent className="sm:max-w-md p-0 overflow-hidden max-h-[85vh] flex flex-col gap-0 bg-zinc-950 border border-white/10">
                <DialogHeader className="p-4 pb-0 shrink-0">
                    <DialogTitle className="text-center text-zinc-100">@{username || "user"}</DialogTitle>
                </DialogHeader>

                {/* Tab bar */}
                <div className="flex border-b border-white/10 shrink-0">
                    {(["followers", "following"] as TabType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "flex-1 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px",
                                activeTab === tab
                                    ? "border-lantern text-lantern"
                                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {tab === "followers" ? "Followers" : "Following"}
                            <span className="ml-1.5 text-zinc-500 font-normal">
                                {tab === "followers" ? followersCount : followingCount}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {activeTab === "followers" ? (
                        <UserList userId={userId} type="followers" isOwnProfile={isOwnProfile} onClose={() => onOpenChange(false)} />
                    ) : (
                        <UserList userId={userId} type="following" isOwnProfile={isOwnProfile} onClose={() => onOpenChange(false)} />
                    )}
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
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
        trpc.user[type === "followers" ? "getFollowers" : "getFollowing"].useInfiniteQuery(
            { userId, limit: 20 },
            { getNextPageParam: (last) => last.nextCursor }
        );

    const items = data?.pages.flatMap((p) => p.items) ?? [];

    if (isLoading) {
        return (
            <div className="p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <RowSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Users className="w-5 h-5 text-zinc-500" />
                </div>
                <p className="text-sm text-zinc-500">
                    {type === "followers"
                        ? isOwnProfile ? "When people follow you, they'll appear here." : "No followers yet."
                        : isOwnProfile ? "When you follow people, they'll appear here." : "Not following anyone yet."}
                </p>
            </div>
        );
    }

    return (
        <div className="p-2">
            {items.map((item) => (
                <UserRow
                    key={item.id}
                    item={item}
                    isOwnProfile={isOwnProfile}
                    listType={type}
                    onClose={onClose}
                />
            ))}
            {hasNextPage && (
                <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-2"
                >
                    {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load more"}
                </button>
            )}
        </div>
    );
}

interface UserRowProps {
    item: { id: string; name: string | null; username: string | null; avatar_url: string | null; bio: string | null; isFollowing: boolean };
    isOwnProfile: boolean;
    listType: TabType;
    onClose: () => void;
}

function UserRow({ item, isOwnProfile, listType, onClose }: UserRowProps) {
    const { data: session } = useAuthSession();
    const isCurrentUser = session?.user?.id === item.id;
    const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
    const [isRemoved, setIsRemoved] = useState(false);
    const utils = trpc.useUtils();

    const follow = trpc.user.follow.useMutation({
        onMutate: () => setOptimisticFollowing(true),
        onError: () => setOptimisticFollowing(null),
        onSuccess: () => { setOptimisticFollowing(null); utils.user.getFollowers.invalidate(); utils.user.getFollowing.invalidate(); },
    });
    const unfollow = trpc.user.unfollow.useMutation({
        onMutate: () => setOptimisticFollowing(false),
        onError: () => setOptimisticFollowing(null),
        onSuccess: () => { setOptimisticFollowing(null); utils.user.getFollowers.invalidate(); utils.user.getFollowing.invalidate(); },
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

    if (isRemoved) return null;

    return (
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">
            <Link href={`/@${item.username}`} onClick={onClose} className="shrink-0">
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden">
                    {item.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.avatar_url} alt={item.name ?? ""} className="object-cover w-full h-full" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm font-bold">
                            {(item.name ?? item.username ?? "?")[0]?.toUpperCase()}
                        </div>
                    )}
                </div>
            </Link>

            <Link href={`/@${item.username}`} onClick={onClose} className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">{item.name || item.username || "Unknown"}</p>
                <p className="text-xs text-zinc-500 truncate">@{item.username}</p>
                {item.bio && <p className="text-xs text-zinc-500 truncate mt-0.5">{item.bio}</p>}
            </Link>

            {!isCurrentUser && (
                <button
                    onClick={handleToggle}
                    disabled={isPending}
                    className={cn(
                        "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1",
                        isFollowing
                            ? "border border-white/15 text-zinc-300 hover:border-red-500/50 hover:text-red-400"
                            : "bg-white text-black hover:bg-white/90"
                    )}
                >
                    {isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isFollowing ? (
                        <><UserMinus className="w-3 h-3" /> Following</>
                    ) : (
                        <><UserPlus className="w-3 h-3" /> Follow</>
                    )}
                </button>
            )}
        </div>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 p-2">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
        </div>
    );
}
