"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function HiddenPostsList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getHiddenPosts.useQuery();
    const unhide = trpc.moderation.unhidePost.useMutation({
        onSuccess: () => { utils.moderation.getHiddenPosts.invalidate(); toast.success("Post unhidden"); },
    });
    const clearAll = trpc.moderation.clearAllHidden.useMutation({
        onSuccess: () => { utils.moderation.getHiddenPosts.invalidate(); toast.success("All hidden posts cleared"); },
    });

    if (isLoading) return (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
    );

    if (!data?.length) return (
        <div className="text-center py-12 space-y-2">
            <EyeOff className="w-10 h-10 mx-auto text-zinc-700" />
            <p className="text-sm text-zinc-500">No hidden posts</p>
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <button
                    onClick={() => clearAll.mutate()}
                    disabled={clearAll.isPending}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                >
                    <Trash2 className="w-3.5 h-3.5" /> Clear all
                </button>
            </div>
            {data.map(h => (
                <div key={h.id} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                    <EyeOff className="w-4 h-4 text-zinc-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-300 truncate">{h.content || "Media post"}</p>
                        <p className="text-xs text-zinc-600">
                            by @{h.authorUsername} · hidden {formatDistanceToNow(new Date(h.hiddenAt))} ago
                            {h.reason && <> · {h.reason.replace(/_/g, " ")}</>}
                        </p>
                    </div>
                    <button
                        onClick={() => unhide.mutate({ postId: h.postId })}
                        disabled={unhide.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-40 shrink-0"
                    >
                        Unhide
                    </button>
                </div>
            ))}
        </div>
    );
}
