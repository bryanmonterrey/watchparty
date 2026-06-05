"use client";

import React from "react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, RetweetIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkIcon, Users } from "lucide-react";

interface UserHoverCardProps {
    userId?: string | null;
    username?: string | null;
    children: React.ReactNode;
}

export function UserHoverCard({ userId, username, children }: UserHoverCardProps) {
    const { data: profile, isLoading } = trpc.user.getProfile.useQuery(
        { userId: userId || undefined, username: username || undefined },
        { enabled: !!(userId || username) }
    );

    return (
        <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
                <div className="w-full cursor-pointer">
                    {children}
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="overflow-hidden bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10">
                {isLoading ? (
                    <div className="p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                            <Skeleton className="w-16 h-16 rounded-full" />
                            <Skeleton className="w-20 h-8 rounded-full" />
                        </div>
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                        <div className="flex gap-4">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                    </div>
                ) : profile ? (
                    <div className="flex flex-col">
                        {/* Header Area */}
                        <div className="px-4 pt-3 pb-2">
                            <div className="flex justify-between items-start mb-2">
                                <div className="w-[70px] h-[70px] rounded-full border-2 border-black overflow-hidden bg-zinc-800 -mt-1 scale-105 transform origin-top-left transition-transform hover:scale-110">
                                    {profile.avatar_url ? (
                                        <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-white font-bold text-xl">
                                            {profile.name[0]}
                                        </div>
                                    )}
                                </div>
                                <button className="bg-white hover:bg-zinc-200 transition-colors text-black font-bold h-[34px] px-4 rounded-full text-[14px]">
                                    {profile.isFollowing ? "Following" : "Follow"}
                                </button>
                            </div>

                            {/* User Identity */}
                            <div className="flex flex-col mb-3">
                                <div className="flex items-center gap-1 group/name">
                                    <span className="font-bold text-[18px] text-white hover:underline cursor-pointer">
                                        {profile.name}
                                    </span>
                                    {profile.verifiedTier === "verified" && <VerifiedBadgeIcon className="w-4 h-4 shrink-0" />}
                                    {profile.verifiedTier === "business" && <BusinessBadgeIcon className="w-4 h-4 shrink-0" />}
                                    {profile.verifiedTier === "government" && <GovBadgeIcon className="w-4 h-4 shrink-0" />}
                                    <span className="text-zinc-400">🌊</span>
                                </div>
                                <span className="text-zinc-500 text-[15px]">@{profile.username}</span>
                            </div>

                            {/* Bio */}
                            {profile.bio && (
                                <div className="text-[15px] text-zinc-100 mb-3 leading-tight">
                                    {profile.bio.split(" ").map((word, i) => (
                                        word.startsWith("@") ? (
                                            <span key={i} className="text-sky-500 hover:underline cursor-pointer">{word} </span>
                                        ) : word + " "
                                    ))}
                                </div>
                            )}

                            {/* Stats */}
                            <div className="flex items-center gap-4 text-[14px] mb-4">
                                <div className="flex items-center gap-1 hover:underline cursor-pointer">
                                    <span className="font-bold text-white">{profile.followingCount}</span>
                                    <span className="text-zinc-500">Following</span>
                                </div>
                                <div className="flex items-center gap-1 hover:underline cursor-pointer">
                                    <span className="font-bold text-white">{(profile.followersCount / 1000).toFixed(1)}K</span>
                                    <span className="text-zinc-500">Followers</span>
                                </div>
                            </div>

                            {/* Mutuals / Social Proof */}
                            <div className="flex items-center gap-2 mb-4 group cursor-pointer">
                                <div className="flex -space-x-1.5">
                                    {[1, 2, 3].map((_, i) => (
                                        <div key={i} className="w-5 h-5 rounded-full border border-black bg-zinc-800 overflow-hidden shrink-0">
                                            {/* Mock mutual avatars if profile.mutualFollowers is empty for demo */}
                                            {profile.mutualFollowers?.[i]?.avatar_url ? (
                                                <img src={profile.mutualFollowers[i].avatar_url!} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-zinc-700" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <span className="text-[13px] text-zinc-500 group-hover:underline">
                                    Followed by DEGEN NEWS, Mika, and 2 others you follow
                                </span>
                            </div>

                            {/* Action Button: Profile Summary */}
                            <button className="w-full flex items-center justify-center gap-2 border border-white/20 hover:bg-white/5 transition-all text-white font-bold h-[44px] rounded-full text-[15px] mb-2">
                                <RetweetIcon className="w-5 h-5 rotate-90" />
                                <span>Profile Summary</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-center text-zinc-500">User profile not available</div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
}
