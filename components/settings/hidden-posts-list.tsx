"use client";

import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { EmptyState, Panel, PanelSkeleton } from "@/components/settings/ui";

export function HiddenPostsList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getHiddenPosts.useQuery();
    const unhide = trpc.moderation.unhidePost.useMutation({
        onSuccess: () => { utils.moderation.getHiddenPosts.invalidate(); toast.success("Post unhidden"); },
    });
    const clearAll = trpc.moderation.clearAllHidden.useMutation({
        onSuccess: () => { utils.moderation.getHiddenPosts.invalidate(); toast.success("All hidden posts cleared"); },
    });

    if (isLoading) return <PanelSkeleton rows={3} rowClassName="h-16" />;

    if (!data?.length) return (
        <EmptyState title="No hidden posts" hint="Posts you hide from your feed collect here" />
    );

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <button
                    onClick={() => clearAll.mutate()}
                    disabled={clearAll.isPending}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-pastelred transition-colors hover:bg-pastelred/10 disabled:opacity-40"
                >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5" strokeWidth={2} /> Clear all
                </button>
            </div>
            <Panel className="p-1.5">
                {data.map(h => (
                    <div key={h.id} className="flex items-start gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                        <HugeiconsIcon icon={ViewOffSlashIcon} className="mt-0.5 size-4 shrink-0 text-zinc-600" strokeWidth={2} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium text-zinc-300">{h.content || "Media post"}</p>
                            <p className="text-[12px] font-medium text-zinc-600">
                                by @{h.authorUsername} · hidden {formatDistanceToNow(new Date(h.hiddenAt))} ago
                                {h.reason && <> · {h.reason.replace(/_/g, " ")}</>}
                            </p>
                        </div>
                        <button
                            onClick={() => unhide.mutate({ postId: h.postId })}
                            disabled={unhide.isPending}
                            className="shrink-0 cursor-pointer rounded-full bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                            Unhide
                        </button>
                    </div>
                ))}
            </Panel>
        </div>
    );
}
