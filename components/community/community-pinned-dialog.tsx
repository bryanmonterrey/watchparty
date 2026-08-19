"use client";

import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";

export function CommunityPinnedDialog({
    channelId,
    channelName,
    open,
    onOpenChange,
}: {
    channelId: string;
    channelName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { data: pinned = [], isLoading } = trpc.community.getPinnedMessages.useQuery(
        { channelId },
        { enabled: open },
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-4 rounded-4xl p-6 sm:max-w-[440px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">
                    Pinned in #{channelName}
                </DialogTitle>

                <div className="max-h-[360px] min-h-[120px] space-y-1 overflow-y-auto hidden-scrollbar">
                    {isLoading && (
                        <div className="flex flex-col gap-2 pt-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-14 overflow-hidden rounded-[16px]"><div className="size-full shimmer-skeleton" /></div>
                            ))}
                        </div>
                    )}

                    {!isLoading && pinned.length === 0 && (
                        <div className="flex h-[120px] flex-col items-center justify-center gap-1 text-center">
                            <p className="text-[14px] font-bold text-zinc-400">Nothing pinned yet</p>
                            <p className="text-[12px] font-medium text-zinc-600">Mods can pin important messages from the hover menu</p>
                        </div>
                    )}

                    {pinned.map((m) => (
                        <div key={m.id} className="flex items-start gap-3 rounded-[16px] bg-white/[0.03] p-3">
                            <Avatar className="size-8 shrink-0">
                                <AvatarImage src={m.userImage || undefined} alt={m.userName || ""} />
                                <AvatarFallback className="bg-white/10 text-[12px] font-bold text-zinc-300">
                                    {(m.userName || "?")[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                    <p className="truncate text-[13px] font-bold text-white">{m.userName}</p>
                                    <p className="shrink-0 text-[11px] font-medium text-zinc-600">{format(new Date(m.createdAt), "d MMM yyyy")}</p>
                                </div>
                                <p className="mt-0.5 break-words text-[13px] font-medium leading-relaxed text-zinc-300">{m.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
