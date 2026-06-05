"use client";

import { trpc } from "@/lib/trpc/client";
import { formatRelativeTime } from "@/lib/date-utils";
import { Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";

interface DraftsDrawerProps {
    open: boolean;
    onClose: () => void;
}

export function DraftsDrawer({ open, onClose }: DraftsDrawerProps) {
    const utils = trpc.useUtils();
    const { data: drafts, isLoading } = trpc.content.getDrafts.useQuery(undefined, { enabled: open });

    const deleteDraft = trpc.content.deleteDraft.useMutation({
        onSuccess: () => {
            utils.content.getDrafts.invalidate();
            toast.success("Draft deleted");
        },
    });

    const publishDraft = trpc.content.publishDraft.useMutation({
        onSuccess: () => {
            utils.content.getDrafts.invalidate();
            utils.content.getFeed.invalidate();
            toast.success("Draft published!");
            onClose();
        },
        onError: err => toast.error(err.message),
    });

    return (
        <Drawer open={open} onOpenChange={v => !v && onClose()}>
            <DrawerContent className="bg-black2 border-white/10 max-h-[70vh]">
                <DrawerHeader>
                    <DrawerTitle className="text-zinc-100">Drafts</DrawerTitle>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-6 flex flex-col gap-3">
                    {isLoading ? (
                        [0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
                    ) : drafts?.length === 0 ? (
                        <p className="text-sm text-zinc-500 text-center py-8">No drafts saved.</p>
                    ) : drafts?.map(draft => (
                        <div key={draft.id} className="border border-white/10 rounded-xl p-3 bg-zinc-900/40">
                            <p className="text-[14px] text-zinc-200 line-clamp-2 mb-2">
                                {draft.content || <span className="text-zinc-500 italic">No text</span>}
                            </p>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500">
                                    {formatRelativeTime(new Date(draft.updatedAt).toISOString())}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => deleteDraft.mutate({ postId: draft.id })}
                                        className="text-zinc-500 hover:text-red-500 p-1.5 rounded-full hover:bg-red-500/10 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => publishDraft.mutate({ postId: draft.id })}
                                        className="flex items-center gap-1.5 text-xs font-bold text-black bg-white hover:bg-zinc-200 px-3 py-1.5 rounded-full transition-colors"
                                    >
                                        <Send className="w-3 h-3" />
                                        Publish
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
