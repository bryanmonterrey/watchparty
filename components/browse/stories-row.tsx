"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Plus } from "lucide-react";
import { StoryViewer } from "./story-viewer";
import { StoryCreator } from "./story-creator";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";

export function StoriesRow() {
    const { data: session } = useAuthSession();
    const { data, isLoading } = trpc.story.getActiveStories.useQuery();
    const { data: viewedData } = trpc.story.getViewedStoryIds.useQuery(
        { storyIds: (data?.stories ?? []).map(s => s.id) },
        { enabled: !!session?.user && (data?.stories?.length ?? 0) > 0 }
    );

    const [viewerGroupIndex, setViewerGroupIndex] = useState<number | null>(null);
    const [showCreator, setShowCreator] = useState(false);

    const stories = data?.stories ?? [];
    const viewedIds = new Set(viewedData?.viewedIds ?? []);

    // Group stories by user
    const groups: { userId: string; user: typeof stories[0]["user"]; stories: typeof stories }[] = [];
    for (const story of stories) {
        const existing = groups.find(g => g.userId === story.userId);
        if (existing) {
            existing.stories.push(story);
        } else {
            groups.push({ userId: story.userId, user: story.user, stories: [story] });
        }
    }

    if (isLoading) {
        return (
            <div className="flex gap-3 px-4 py-3 border-b border-white/10 overflow-x-auto scrollbar-hide">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                        <div className="w-14 h-14 rounded-full bg-zinc-800 animate-pulse" />
                        <div className="w-10 h-2 bg-zinc-800 rounded animate-pulse" />
                    </div>
                ))}
            </div>
        );
    }

    if (groups.length === 0 && !session?.user) return null;

    return (
        <>
            <div className="flex gap-3 px-4 py-3 border-b border-white/10 overflow-x-auto scrollbar-hide">
                {/* Add story button for logged-in user */}
                {session?.user && (
                    <button
                        onClick={() => setShowCreator(true)}
                        className="flex flex-col items-center gap-1.5 shrink-0"
                    >
                        <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-dashed border-white/20 flex items-center justify-center hover:border-lantern/50 transition-colors">
                            <Plus className="w-6 h-6 text-zinc-500" />
                        </div>
                        <span className="text-xs text-zinc-500 w-14 text-center truncate">Your story</span>
                    </button>
                )}

                {/* Story groups */}
                {groups.map((group, i) => {
                    const allViewed = group.stories.every(s => viewedIds.has(s.id));
                    const isOwn = group.userId === session?.user?.id;
                    return (
                        <button
                            key={group.userId}
                            onClick={() => setViewerGroupIndex(i)}
                            className="flex flex-col items-center gap-1.5 shrink-0"
                        >
                            <div className={cn(
                                "w-14 h-14 rounded-full p-0.5",
                                allViewed
                                    ? "bg-zinc-700"
                                    : "bg-gradient-to-tr from-lantern via-emerald-400 to-teal-300"
                            )}>
                                <div className="w-full h-full rounded-full overflow-hidden border-2 border-zinc-950">
                                    {group.user.avatar_url
                                        ? <img src={group.user.avatar_url} alt={group.user.name} className="w-full h-full object-cover" />
                                        : <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-400 font-bold">{group.user.name[0]}</div>
                                    }
                                </div>
                            </div>
                            <span className="text-xs text-zinc-400 w-14 text-center truncate">{isOwn ? "You" : group.user.username ?? group.user.name}</span>
                        </button>
                    );
                })}
            </div>

            {viewerGroupIndex !== null && (
                <StoryViewer
                    groups={groups as any}
                    initialGroupIndex={viewerGroupIndex}
                    onClose={() => setViewerGroupIndex(null)}
                />
            )}

            <StoryCreator open={showCreator} onClose={() => setShowCreator(false)} />
        </>
    );
}
