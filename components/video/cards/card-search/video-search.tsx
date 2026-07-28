"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { SearchInput } from "./search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { VideoResult, SearchSelectPayload } from "./types";

interface VideoSearchProps {
    onClose: () => void;
    onSelect: (payload: SearchSelectPayload) => void;
}

function VideoGrid({
    items,
    isLoading,
    onSelect,
}: {
    items: VideoResult[];
    isLoading: boolean;
    onSelect: (item: VideoResult) => void;
}) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2">
                        <Skeleton className="aspect-video rounded-lg bg-zinc-800" />
                        <Skeleton className="h-3 w-3/4 rounded bg-zinc-800" />
                    </div>
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center py-16">
                <p className="text-[13px] text-zinc-600">No videos found</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-5 gap-4">
            {items.map(video => (
                <button
                    key={video.id}
                    onClick={() => onSelect(video)}
                    className="flex flex-col gap-1.5 text-left group"
                >
                    <div className="aspect-video rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
                        {video.thumbnailUrl ? (
                            <img
                                src={video.thumbnailUrl}
                                alt={video.title}
                                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                            />
                        ) : (
                            <div className="w-full h-full bg-zinc-800" />
                        )}
                    </div>
                    <p className="text-[11px] text-zinc-300 line-clamp-2 leading-tight group-hover:text-white transition-colors">
                        {video.title}
                    </p>
                </button>
            ))}
        </div>
    );
}

export function VideoSearch({ onClose, onSelect }: VideoSearchProps) {
    const [query, setQuery] = useState("");

    const { data: session } = useAuthSession();
    const userId = session?.user?.id;

    const { data, isLoading } = trpc.content.getVideosByUser.useQuery(
        { userId: userId ?? "", limit: 20 },
        { enabled: !!userId }
    );

    const videos: VideoResult[] = useMemo(() => {
        const all = (data?.videos ?? []).map(v => ({
            id: v.id,
            title: v.title ?? "",
            thumbnailUrl: v.thumbnailUrl ?? null,
            duration: v.duration ?? null,
        }));
        if (!query.trim()) return all;
        const q = query.toLowerCase();
        return all.filter(v => v.title.toLowerCase().includes(q));
    }, [data, query]);

    const handleSelect = (video: VideoResult) => {
        // /video/<id> resolves on its own, so this no longer needs the session's
        // username — and no longer produces an empty url when there isn't one.
        onSelect({ url: `/video/${video.id}`, title: video.title, thumbnailUrl: video.thumbnailUrl });
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
                <h2 className="text-[15px] font-medium text-white">Choose specific video</h2>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <X className="size-5" strokeWidth={1.5} />
                </button>
            </div>

            {/* Search */}
            <div className="border-b border-flexborder/60 flex-shrink-0">
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search your videos"
                    autoFocus
                    className="border-b-0"
                />
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5">
                <VideoGrid
                    items={videos}
                    isLoading={!!userId && isLoading}
                    onSelect={handleSelect}
                />
            </div>
        </div>
    );
}
