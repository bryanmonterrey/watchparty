"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { Clock, Trash2, Send, Loader2, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface ScheduledPostsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ScheduledPostsDrawer({ open, onOpenChange }: ScheduledPostsDrawerProps) {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.content.getScheduledPosts.useQuery(undefined, { enabled: open });

    const cancelScheduled = trpc.content.cancelScheduled.useMutation({
        onSuccess: () => {
            utils.content.getScheduledPosts.invalidate();
            toast.success("Scheduled post cancelled");
        },
        onError: (err) => toast.error(err.message),
    });

    const publishDraft = trpc.content.publishDraft.useMutation({
        onSuccess: () => {
            utils.content.getScheduledPosts.invalidate();
            toast.success("Post published now");
        },
        onError: (err) => toast.error(err.message),
    });

    const posts = data ?? [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="bg-zinc-950 border-t border-white/10 rounded-t-2xl max-h-[80vh] overflow-y-auto">
                <SheetHeader className="mb-4">
                    <SheetTitle className="flex items-center gap-2 text-zinc-100">
                        <Clock className="w-5 h-5 text-lantern" />
                        Scheduled Posts
                    </SheetTitle>
                </SheetHeader>

                {isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex gap-3 p-3 rounded-xl bg-zinc-900">
                                <Skeleton className="w-full h-16" />
                            </div>
                        ))}
                    </div>
                ) : posts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                            <CalendarX className="w-5 h-5 text-zinc-500" />
                        </div>
                        <p className="text-sm text-zinc-500">No scheduled posts</p>
                    </div>
                ) : (
                    <div className="space-y-2 pb-4">
                        {posts.map((post) => (
                            <ScheduledPostRow
                                key={post.id}
                                post={post}
                                onCancel={() => cancelScheduled.mutate({ postId: post.id })}
                                onPublishNow={() => publishDraft.mutate({ postId: post.id })}
                                cancelling={cancelScheduled.isPending && cancelScheduled.variables?.postId === post.id}
                                publishing={publishDraft.isPending && publishDraft.variables?.postId === post.id}
                            />
                        ))}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

interface ScheduledPostRowProps {
    post: { id: string; content: string | null; scheduledFor: Date | null; images?: string[] | null };
    onCancel: () => void;
    onPublishNow: () => void;
    cancelling: boolean;
    publishing: boolean;
}

function ScheduledPostRow({ post, onCancel, onPublishNow, cancelling, publishing }: ScheduledPostRowProps) {
    const scheduledDate = post.scheduledFor ? new Date(post.scheduledFor) : null;
    const isPast = scheduledDate ? scheduledDate <= new Date() : false;

    return (
        <div className={cn(
            "flex gap-3 p-3 rounded-xl border transition-colors",
            isPast ? "border-amber-500/20 bg-amber-500/5" : "border-white/8 bg-zinc-900/60"
        )}>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 line-clamp-2">
                    {post.content || <span className="text-zinc-500 italic">No text</span>}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock className={cn("w-3 h-3", isPast ? "text-amber-400" : "text-zinc-500")} />
                    <span className={cn("text-xs", isPast ? "text-amber-400" : "text-zinc-500")}>
                        {scheduledDate
                            ? isPast
                                ? `Pending — ${formatDistanceToNow(scheduledDate, { addSuffix: true })}`
                                : `Scheduled ${formatDistanceToNow(scheduledDate, { addSuffix: true })}`
                            : "No date set"}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={onPublishNow}
                    disabled={publishing || cancelling}
                    title="Publish now"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-lantern hover:bg-lantern/10 transition-colors disabled:opacity-50"
                >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
                <button
                    onClick={onCancel}
                    disabled={cancelling || publishing}
                    title="Cancel"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                    {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
