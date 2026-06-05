"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Eye, Play, Pause } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Story {
    id: string;
    userId: string;
    mediaUrl: string;
    mediaType: "image" | "video";
    caption: string | null;
    views: number;
    expiresAt: Date;
    createdAt: Date;
    user: {
        id: string;
        name: string;
        username: string | null;
        avatar_url: string | null;
    };
}

interface StoryGroup {
    userId: string;
    user: Story["user"];
    stories: Story[];
}

interface StoryViewerProps {
    groups: StoryGroup[];
    initialGroupIndex: number;
    onClose: () => void;
}

const STORY_DURATION = 5000; // 5s per image story

export function StoryViewer({ groups, initialGroupIndex, onClose }: StoryViewerProps) {
    const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
    const [storyIndex, setStoryIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [paused, setPaused] = useState(false);
    const [videoPlaying, setVideoPlaying] = useState(false);

    const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const group = groups[groupIndex];
    const story = group?.stories[storyIndex];
    const isVideo = story?.mediaType === "video";

    const viewStory = trpc.story.viewStory.useMutation();

    const goNext = useCallback(() => {
        if (storyIndex < (group?.stories.length ?? 0) - 1) {
            setStoryIndex(i => i + 1);
            setProgress(0);
        } else if (groupIndex < groups.length - 1) {
            setGroupIndex(g => g + 1);
            setStoryIndex(0);
            setProgress(0);
        } else {
            onClose();
        }
    }, [storyIndex, groupIndex, group, groups, onClose]);

    const goPrev = useCallback(() => {
        if (storyIndex > 0) {
            setStoryIndex(i => i - 1);
            setProgress(0);
        } else if (groupIndex > 0) {
            setGroupIndex(g => g - 1);
            setStoryIndex(0);
            setProgress(0);
        }
    }, [storyIndex, groupIndex]);

    // Auto-advance for images
    useEffect(() => {
        if (isVideo) return;
        if (paused) return;

        progressRef.current = setInterval(() => {
            setProgress(p => {
                if (p >= 100) {
                    goNext();
                    return 0;
                }
                return p + (100 / (STORY_DURATION / 100));
            });
        }, 100);

        return () => { if (progressRef.current) clearInterval(progressRef.current); };
    }, [storyIndex, groupIndex, paused, isVideo, goNext]);

    // Video auto-advance: advance when video ends
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handleEnded = () => goNext();
        const handleTimeUpdate = () => {
            if (video.duration) setProgress((video.currentTime / video.duration) * 100);
        };
        video.addEventListener("ended", handleEnded);
        video.addEventListener("timeupdate", handleTimeUpdate);
        return () => {
            video.removeEventListener("ended", handleEnded);
            video.removeEventListener("timeupdate", handleTimeUpdate);
        };
    }, [story?.id, goNext]);

    // Track view
    useEffect(() => {
        if (story?.id) viewStory.mutate({ storyId: story.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [story?.id]);

    // Reset progress on story change
    useEffect(() => {
        setProgress(0);
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        }
    }, [story?.id]);

    const togglePause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isVideo && videoRef.current) {
            if (videoRef.current.paused) { videoRef.current.play(); setPaused(false); }
            else { videoRef.current.pause(); setPaused(true); }
        } else {
            setPaused(p => !p);
        }
    };

    if (!story) return null;

    return (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center" onClick={onClose}>
            {/* Main story container */}
            <div
                className="relative w-full max-w-sm h-full max-h-[85vh] rounded-2xl overflow-hidden select-none"
                onClick={e => e.stopPropagation()}
            >
                {/* Progress bars */}
                <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
                    {group.stories.map((s, i) => (
                        <div key={s.id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                            <div
                                className="h-full bg-white rounded-full transition-none"
                                style={{
                                    width: i < storyIndex ? "100%" : i === storyIndex ? `${progress}%` : "0%",
                                }}
                            />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div className="absolute top-7 left-3 right-3 flex items-center gap-2 z-10">
                    <img
                        src={story.user.avatar_url ?? ""}
                        alt={story.user.name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-white/30"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-bold leading-none truncate">{story.user.name}</p>
                        <p className="text-white/60 text-xs">{formatDistanceToNow(new Date(story.createdAt))} ago</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-white/60 text-xs">
                        <Eye className="w-3.5 h-3.5" />
                        {story.views}
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Media */}
                {isVideo ? (
                    <video
                        ref={videoRef}
                        src={story.mediaUrl}
                        className="w-full h-full object-cover"
                        autoPlay
                        playsInline
                        onClick={togglePause}
                    />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />
                )}

                {/* Caption */}
                {story.caption && (
                    <div className="absolute bottom-12 left-3 right-3 bg-black/40 rounded-xl px-3 py-2">
                        <p className="text-white text-sm leading-snug">{story.caption}</p>
                    </div>
                )}

                {/* Pause indicator */}
                {paused && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Pause className="w-12 h-12 text-white/60" />
                    </div>
                )}

                {/* Navigation zones */}
                <button
                    className="absolute left-0 top-0 bottom-0 w-1/3"
                    onClick={goPrev}
                    onMouseDown={() => setPaused(true)}
                    onMouseUp={() => setPaused(false)}
                />
                <button
                    className="absolute right-0 top-0 bottom-0 w-1/3"
                    onClick={goNext}
                    onMouseDown={() => setPaused(true)}
                    onMouseUp={() => setPaused(false)}
                />
            </div>

            {/* Group prev/next arrows */}
            {groupIndex > 0 && (
                <button
                    onClick={e => { e.stopPropagation(); setGroupIndex(g => g - 1); setStoryIndex(0); setProgress(0); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            {groupIndex < groups.length - 1 && (
                <button
                    onClick={e => { e.stopPropagation(); setGroupIndex(g => g + 1); setStoryIndex(0); setProgress(0); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}
        </div>
    );
}
