"use client";

import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { HeartIcon, BubbleIcon, RetweetIcon, LinkIcon, VolumeOnIcon, VolumeOffIcon } from "@/components/icons";
import { AmbientGlowVideo } from "./ambient-glow-video";
import { trpc } from "@/lib/trpc/client";
import { PostComposerDialog } from "@/components/browse/post-composer-dialog";

interface ShortVideoCardProps {
    video: {
        id: string;
        videoUrl: string | null | undefined;
        thumbnailUrl?: string | null;
        title: string | null | undefined;
        description: string | null;
        likes: number;
        comments: number;
        reposts: number;
        views: number;
        isLiked?: boolean;
        createdAt?: Date | string;
        user: {
            name: string | null;
            username: string | null;
            avatar_url: string | null;
        };
    };
    isActive: boolean;
}

export function ShortVideoCard({ video, isActive }: ShortVideoCardProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isMuted, setIsMuted] = useState(true);

    const [liked, setLiked] = useState(video.isLiked ?? false);
    const [likesCount, setLikesCount] = useState(video.likes);
    const [reposted, setReposted] = useState(false);
    const [repostsCount, setRepostsCount] = useState(video.reposts);
    const [commentsCount, setCommentsCount] = useState(video.comments);
    const [showCommentDialog, setShowCommentDialog] = useState(false);

    const processingLike = useRef(false);
    const processingRepost = useRef(false);

    useEffect(() => {
        if (videoRef.current) videoRef.current.muted = isMuted;
    }, [isMuted]);

    const toggleLike = trpc.content.toggleLike.useMutation({
        onMutate: () => {
            const next = !liked;
            setLiked(next);
            setLikesCount(prev => next ? prev + 1 : Math.max(0, prev - 1));
        },
        onError: () => {
            setLiked(video.isLiked ?? false);
            setLikesCount(video.likes);
        },
    });

    const toggleRepost = trpc.content.repost.useMutation({
        onMutate: () => {
            const next = !reposted;
            setReposted(next);
            setRepostsCount(prev => next ? prev + 1 : Math.max(0, prev - 1));
        },
        onError: () => {
            setReposted(false);
            setRepostsCount(video.reposts);
        },
    });

    const handleLike = () => {
        if (processingLike.current) return;
        processingLike.current = true;
        toggleLike.mutate({ postId: video.id, contentType: "post" });
        setTimeout(() => { processingLike.current = false; }, 150);
    };

    const handleRepost = () => {
        if (processingRepost.current) return;
        processingRepost.current = true;
        toggleRepost.mutate({ postId: video.id });
        setTimeout(() => { processingRepost.current = false; }, 150);
    };

    const postRef = {
        id: video.id,
        content: video.description,
        imageUrl: video.thumbnailUrl ?? null,
        videoUrl: video.videoUrl ?? null,
        createdAt: video.createdAt ?? new Date(),
        user: video.user,
    };

    return (
        <>
            <div className="snap-start snap-always w-full h-full flex items-center justify-center gap-4 py-2 px-4 relative bg-canvas [contain:none] overflow-visible">
                <div className="absolute inset-0 z-0 bg-canvas" />

                <div className="ambient-video-container isolate relative z-10 h-full aspect-[9/16] flex-shrink-0 sm:rounded-2xl [contain:none] overflow-visible">
                    <AmbientGlowVideo
                        src={video.videoUrl ?? undefined}
                        className="w-full h-full object-cover relative z-20 sm:rounded-2xl"
                        isActive={isActive}
                        videoRef={videoRef}
                        muted={isMuted}
                        onClick={() => {
                            if (videoRef.current?.paused) {
                                // Ignore the benign AbortError if play is interrupted by a pause.
                                videoRef.current.play().catch((err: unknown) => {
                                    if (err instanceof Error && err.name === "AbortError") return;
                                    console.error(err);
                                });
                            } else {
                                videoRef.current?.pause();
                            }
                        }}
                    />

                    {/* Mute toggle */}
                    <button
                        onClick={() => setIsMuted(m => !m)}
                        className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors"
                    >
                        {isMuted ? <VolumeOffIcon className="w-4 h-4" /> : <VolumeOnIcon className="w-4 h-4" />}
                    </button>

                    {/* Bottom overlay */}
                    <div className="absolute bottom-0 left-0 w-full p-4 pt-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end pointer-events-none z-20">
                        <div className="flex flex-col gap-2 max-w-[80%] pointer-events-auto">
                            <h3 className="font-bold text-lg text-white">
                                @{video.user.username || video.user.name?.replace(/\s+/g, '').toLowerCase() || "user"}
                            </h3>
                            <p className="text-white/90 text-sm line-clamp-2">
                                {video.title || "Untitled"} {video.description ? `- ${video.description}` : ""}
                            </p>

                            <div className="flex items-center gap-2 mt-2">
                                <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center overflow-hidden animate-[spin_4s_linear_infinite]">
                                    {video.user.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={video.user.avatar_url} alt="audio cover" className="w-5 h-5 object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-zinc-700" />
                                    )}
                                </div>
                                <span className="text-xs text-white/80 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                                    original sound - {video.user.name || ""}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side Action Buttons */}
                <div className="relative z-20 flex flex-col gap-3 items-center justify-end h-full pb-4 shrink-0 px-2 lg:px-4">
                    <div className="relative mb-2">
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/20 bg-zinc-800 shadow-lg">
                            {video.user.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={video.user.avatar_url}
                                    alt={video.user.name || "User"}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl">
                                </div>
                            )}
                        </div>
                    </div>

                    <ActionButton
                        icon={<HeartIcon className="!w-[30px] !h-[30px] stroke-[1.5]" fill={liked ? "currentColor" : "none"} />}
                        label={formatCount(likesCount)}
                        isActive={liked}
                        activeColor="text-red1"
                        onClick={handleLike}
                    />

                    <ActionButton
                        icon={<BubbleIcon className="!w-[30px] !h-[30px] stroke-[1.5]" />}
                        label={formatCount(commentsCount)}
                        onClick={() => setShowCommentDialog(true)}
                    />

                    <ActionButton
                        icon={<RetweetIcon className="!w-[30px] !h-[30px]" />}
                        label={formatCount(repostsCount)}
                        isActive={reposted}
                        activeColor="text-emerald-500"
                        onClick={handleRepost}
                    />

                    <ActionButton
                        icon={<LinkIcon className="!w-[30px] !h-[30px] stroke-[1.5]" />}
                        label="Share"
                    />
                </div>
            </div>

            <PostComposerDialog
                open={showCommentDialog}
                onOpenChange={setShowCommentDialog}
                mode="comment"
                post={postRef}
                onSuccess={() => setCommentsCount(prev => prev + 1)}
            />
        </>
    );
}

function ActionButton({
    icon,
    label,
    isActive = false,
    activeColor = "text-white",
    onClick
}: {
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
    activeColor?: string;
    onClick?: () => void;
}) {
    return (
        <div className="flex flex-col items-center gap-1">
            <Button
                size="icon"
                onClick={onClick}
                className={`w-16 h-16 glass-ring rounded-2xl bg-zinc-900 hover:bg-zinc-800/80 transition-colors shadow-lg flex items-center justify-center p-0 ${isActive ? activeColor : 'text-white hover:text-white'}`}
            >
                {icon}
            </Button>
            <span className="text-[12px] font-semibold tracking-wide drop-shadow-md text-white">{label}</span>
        </div>
    );
}

function formatCount(count: number): string {
    if (!count) return ' ';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
}
