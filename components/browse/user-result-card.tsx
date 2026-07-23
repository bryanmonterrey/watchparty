"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { PostCardAvatar } from "./post-card/post-card-avatar";
import Link from "next/link";

interface UserResultCardProps {
    user: {
        id: string;
        name: string | null;
        username: string | null;
        avatar_url: string | null;
        verifiedTier?: string | null;
        bio?: string | null;
    };
    initialIsFollowing?: boolean;
    className?: string;
}

export function UserResultCard({ user, initialIsFollowing = false, className }: UserResultCardProps) {
    const { data: session } = useAuthSession();
    const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
    const [isHoveringFollowing, setIsHoveringFollowing] = useState(false);
    
    const utils = trpc.useUtils();
    const follow = trpc.user.follow.useMutation({
        onMutate: () => setIsFollowing(true),
        onError: () => setIsFollowing(false),
    });
    const unfollow = trpc.user.unfollow.useMutation({
        onMutate: () => setIsFollowing(false),
        onError: () => setIsFollowing(true),
    });

    const toggleFollow = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session) return; // Should ideally trigger login
        if (isFollowing) {
            unfollow.mutate({ followingId: user.id });
        } else {
            follow.mutate({ followingId: user.id });
        }
    };

    const isOwnProfile = session?.user?.id === user.id;

    return (
        <Link 
            href={`/${user.username}`}
            className={cn("flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer w-full", className)}
        >
            <PostCardAvatar user={user} />
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                            <span className="font-bold text-[15px] text-zinc-100 truncate">
                                {user.name || ""}
                            </span>
                            {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                            {user.verifiedTier === "business" && <BusinessBadgeIcon className="w-4 h-4 shrink-0" />}
                            {user.verifiedTier === "government" && <GovBadgeIcon className="w-4 h-4 shrink-0" />}
                        </div>
                        <span className="text-[15px] text-zinc-500 truncate">
                            @{user.username || "user"}
                        </span>
                    </div>

                    {!isOwnProfile && session && (
                        <button
                            onClick={toggleFollow}
                            onMouseEnter={() => setIsHoveringFollowing(true)}
                            onMouseLeave={() => setIsHoveringFollowing(false)}
                            className={cn(
                                "px-4 h-8 rounded-full text-sm font-bold transition-all shrink-0 cursor-pointer",
                                isFollowing 
                                    ? "bg-transparent border border-zinc-700 text-zinc-100 hover:border-red-500/50 hover:text-red-500 hover:bg-red-500/5"
                                    : "bg-zinc-100 text-black hover:bg-zinc-200"
                            )}
                        >
                            {isFollowing ? (isHoveringFollowing ? "Unfollow" : "Following") : "Follow"}
                        </button>
                    )}
                </div>
                
                {user.bio && (
                    <p className="text-[15px] text-zinc-100 mt-1 line-clamp-2 leading-tight">
                        {user.bio}
                    </p>
                )}
            </div>
        </Link>
    );
}
