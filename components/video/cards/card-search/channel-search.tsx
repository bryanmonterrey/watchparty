"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { SearchInput } from "./search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import type { ChannelResult, SearchSelectPayload } from "./types";

interface ChannelSearchProps {
    onClose: () => void;
    onSelect: (payload: SearchSelectPayload) => void;
}

function ChannelGrid({
    items,
    isLoading,
    onSelect,
}: {
    items: ChannelResult[];
    isLoading: boolean;
    onSelect: (item: ChannelResult) => void;
}) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                        <Skeleton className="size-16 rounded-full bg-zinc-800" />
                        <Skeleton className="h-3 w-3/4 rounded bg-zinc-800" />
                    </div>
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center py-16">
                <p className="text-[13px] text-zinc-600">No channels found</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-5 gap-4">
            {items.map(channel => (
                <button
                    key={channel.id}
                    onClick={() => onSelect(channel)}
                    className="flex flex-col items-center gap-2 text-center group"
                >
                    <div className="size-16 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 ring-2 ring-transparent group-hover:ring-zinc-600 transition-all">
                        {channel.avatarUrl ? (
                            <img
                                src={channel.avatarUrl}
                                alt={channel.name}
                                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                            />
                        ) : (
                            <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-xl font-medium">
                                {channel.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 w-full">
                        <p className="text-[11px] text-zinc-300 line-clamp-1 leading-tight group-hover:text-white transition-colors font-medium">
                            {channel.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 line-clamp-1 leading-tight">
                            @{channel.username}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    );
}

export function ChannelSearch({ onClose, onSelect }: ChannelSearchProps) {
    const [query, setQuery] = useState("");

    const { data, isLoading } = trpc.content.search.useQuery(
        { query, limit: 20 },
        { enabled: query.trim().length > 0 }
    );

    const channels: ChannelResult[] = useMemo(() => {
        return (data?.users ?? []).map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            avatarUrl: u.avatar_url,
        }));
    }, [data]);

    const handleSelect = (channel: ChannelResult) => {
        onSelect({
            url: `/${channel.username}`,
            title: channel.name,
            thumbnailUrl: channel.avatarUrl,
        });
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
                <h2 className="text-[15px] font-medium text-white">Choose specific channel</h2>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <X className="size-5" strokeWidth={1.5} />
                </button>
            </div>

            {/* Search input */}
            <div className="border-b border-flexborder/60 flex-shrink-0">
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search channels"
                    autoFocus
                    className="border-b-0"
                />
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-5">
                {query.trim() ? (
                    <ChannelGrid
                        items={channels}
                        isLoading={isLoading}
                        onSelect={handleSelect}
                    />
                ) : (
                    <div className="flex items-center justify-center py-16">
                        <p className="text-[13px] text-zinc-600">Search for a channel to get started</p>
                    </div>
                )}
            </div>
        </div>
    );
}
