"use client";

import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc/client";

interface EndScreenProps {
    isEnded: boolean;
    postId: string;
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

export function EndScreen({ isEnded, postId }: EndScreenProps) {
    const { data } = trpc.content.getPublicVideos.useQuery(
        { excludePostId: postId, limit: 3 },
        { enabled: isEnded }
    );

    const videos = (data?.videos ?? []).slice(0, 3);

    return (
        <AnimatePresence>
            {isEnded && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 z-[25] bg-black rounded-3xl flex items-center justify-center px-10"
                >
                    {videos.length === 0 ? (
                        // Empty state — just the dark overlay, no cards
                        <div />
                    ) : (
                        <div
                            className="flex gap-5 items-start justify-center w-full"
                            style={{ maxWidth: videos.length === 1 ? 280 : videos.length === 2 ? 560 : 720 }}
                        >
                            {videos.map((v) => (
                                <Link
                                    key={v.id}
                                    href={`/${v.author.username}/${v.id}`}
                                    className="flex flex-col group flex-1 min-w-0 hover:bg-zinc-900 rounded-2xl -m-2 p-2 transition-all duration-150"
                                >
                                    {/* Thumbnail */}
                                    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 transition-all duration-150">
                                        {v.thumbnailUrl && (
                                            <img
                                                src={v.thumbnailUrl}
                                                alt={v.title ?? ""}
                                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                            />
                                        )}
                                        {v.duration != null && (
                                            <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-2 py-1 rounded-full">
                                                {formatDuration(v.duration)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="mt-2 px-0.5">
                                        <p className="text-white text-base font-semibold leading-snug line-clamp-2 group-hover:text-white/90">
                                            {v.title ?? "Untitled"}
                                        </p>
                                        <p className="text-white/50 text-sm mt-0.5 truncate">
                                            {v.author.name ?? v.author.username}
                                        </p>
                                        <p className="text-white/50 text-sm">
                                            {formatViews(v.views)} views · {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
