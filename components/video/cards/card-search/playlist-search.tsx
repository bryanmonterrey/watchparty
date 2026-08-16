"use client";

import { useState, useMemo } from "react";
import { X, ListVideo } from "lucide-react";
import { SearchInput } from "./search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import type { PlaylistResult, SearchSelectPayload } from "./types";

interface PlaylistSearchProps {
    onClose: () => void;
    onSelect: (payload: SearchSelectPayload) => void;
}

function PlaylistGrid({
    items,
    isLoading,
    onSelect,
}: {
    items: PlaylistResult[];
    isLoading: boolean;
    onSelect: (item: PlaylistResult) => void;
}) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2">
                        <Skeleton className="aspect-video rounded-lg" />
                        <Skeleton className="h-3 w-3/4 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center py-16">
                <p className="text-[13px] text-zinc-600">No playlists found</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-5 gap-4">
            {items.map(playlist => (
                <button
                    key={playlist.id}
                    onClick={() => onSelect(playlist)}
                    className="flex flex-col gap-1.5 text-left group"
                >
                    <div className="aspect-video rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 relative">
                        <div className="w-full h-full bg-zinc-700/60" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/60 rounded-md px-2 py-1.5 flex items-center gap-1.5 group-hover:bg-black/80 transition-colors">
                                <ListVideo className="size-3.5 text-white" strokeWidth={1.5} />
                                {playlist.videoCount !== undefined && (
                                    <span className="text-[11px] text-white font-medium">{playlist.videoCount}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-zinc-300 line-clamp-2 leading-tight group-hover:text-white transition-colors">
                        {playlist.title}
                    </p>
                </button>
            ))}
        </div>
    );
}

export function PlaylistSearch({ onClose, onSelect }: PlaylistSearchProps) {
    const [query, setQuery] = useState("");

    const { data, isLoading } = trpc.content.getMyPlaylists.useQuery();

    const playlists: PlaylistResult[] = useMemo(() => {
        const all = (data ?? []).map(p => ({
            id: p.id,
            title: p.title,
        }));
        if (!query.trim()) return all;
        const q = query.toLowerCase();
        return all.filter(p => p.title.toLowerCase().includes(q));
    }, [data, query]);

    const handleSelect = (playlist: PlaylistResult) => {
        onSelect({
            url: `/playlist/${playlist.id}`,
            title: playlist.title,
        });
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
                <h2 className="text-[15px] font-medium text-white">Choose specific playlist</h2>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <X className="size-5" strokeWidth={1.5} />
                </button>
            </div>

            {/* Search input */}
            <div className="border-b border-flexborder/60 flex-shrink-0">
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search your playlists"
                    autoFocus
                    className="border-b-0"
                />
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5">
                <PlaylistGrid
                    items={playlists}
                    isLoading={isLoading}
                    onSelect={handleSelect}
                />
            </div>
        </div>
    );
}
