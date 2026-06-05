"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StoryCreator } from "./story-creator";
import { StoryViewer } from "./story-viewer";

export function StoriesBar() {
    const { data, isLoading } = trpc.story.getActiveStories.useQuery();
    const [activeStoryUserId, setActiveStoryUserId] = useState<string | null>(null);
    const [showCreator, setShowCreator] = useState(false);

    // Group stories by user
    const grouped = (data?.stories ?? []).reduce((acc, story) => {
        if (!acc[story.userId]) acc[story.userId] = { user: story.user, stories: [] };
        acc[story.userId].stories.push(story);
        return acc;
    }, {} as Record<string, { user: any; stories: any[] }>);

    const groups = Object.values(grouped);

    const openGroup = (userId: string) => {
        setActiveStoryUserId(userId);
    };

    const close = () => setActiveStoryUserId(null);

    if (isLoading) {
        return (
            <div className="flex gap-3 px-4 py-3 overflow-x-auto no-scrollbar">
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                        <Skeleton className="w-14 h-14 rounded-full" />
                        <Skeleton className="w-10 h-2.5 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    if (groups.length === 0) return null;

    return (
        <>
            <div className="flex gap-3 px-4 py-3 overflow-x-auto no-scrollbar border-b border-white/10">
                {/* Add story button */}
                <div
                    onClick={() => setShowCreator(true)}
                    className="flex flex-col items-center gap-1 shrink-0 cursor-pointer"
                >
                    <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center hover:border-zinc-400 transition-colors">
                        <Plus className="w-5 h-5 text-zinc-400" />
                    </div>
                    <span className="text-[11px] text-zinc-500 w-14 text-center truncate">Add</span>
                </div>

                {groups.map(({ user, stories }) => (
                    <button
                        key={user.id}
                        onClick={() => openGroup(user.id)}
                        className="flex flex-col items-center gap-1 shrink-0"
                    >
                        <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-lantern to-emerald-400">
                            <div className="w-full h-full rounded-full overflow-hidden border-2 border-black">
                                {user.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                                        {user.name.charAt(0)}
                                    </div>
                                )}
                            </div>
                        </div>
                        <span className="text-[11px] text-zinc-400 w-14 text-center truncate">{user.name.split(" ")[0]}</span>
                    </button>
                ))}
            </div>

            {/* Story viewer (full-featured with progress timers) */}
            {activeStoryUserId && (
                <StoryViewer
                    groups={groups as any}
                    initialGroupIndex={groups.findIndex(g => g.user.id === activeStoryUserId)}
                    onClose={close}
                />
            )}

            <StoryCreator open={showCreator} onClose={() => setShowCreator(false)} />
        </>
    );
}
