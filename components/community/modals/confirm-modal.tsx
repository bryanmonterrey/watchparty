"use client";

import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// One confirm dialog for the destructive community actions — copy is
// specific per action, the CTA carries the danger color only when the
// action can't be undone.
export function ConfirmModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const router = useRouter();
    const utils = trpc.useUtils();

    const serverId = data.server?.id;
    const afterServerGone = () => {
        utils.community.listServers.invalidate();
        onClose();
        router.push("/communities");
    };

    const deleteServer = trpc.community.deleteServer.useMutation({ onSuccess: afterServerGone });
    const leaveServer = trpc.community.leaveServer.useMutation({ onSuccess: afterServerGone });
    const deleteChannel = trpc.community.deleteChannel.useMutation({
        onSuccess: () => {
            onClose();
            if (serverId) utils.community.getServer.invalidate({ serverId });
        },
    });

    const configs = {
        deleteServer: {
            title: `Delete ${data.server?.name ?? "server"}?`,
            body: "Every channel and message in this server is gone for good. There's no undo.",
            cta: "Delete server",
            danger: true,
            pending: deleteServer.isPending,
            run: () => serverId && deleteServer.mutate({ serverId }),
        },
        leaveServer: {
            title: `Leave ${data.server?.name ?? "server"}?`,
            body: "You'll need a new invite to come back.",
            cta: "Leave server",
            danger: false,
            pending: leaveServer.isPending,
            run: () => serverId && leaveServer.mutate({ serverId }),
        },
        deleteChannel: {
            title: `Delete ${data.channel?.type === "TEXT" ? `#${data.channel?.name}` : data.channel?.name}?`,
            body: "All messages in this channel are gone for good. There's no undo.",
            cta: "Delete channel",
            danger: true,
            pending: deleteChannel.isPending,
            run: () => serverId && data.channel?.id && deleteChannel.mutate({ serverId, channelId: data.channel.id }),
        },
    } as const;

    const config = type && type in configs ? configs[type as keyof typeof configs] : null;
    const isModalOpen = isOpen && !!config;

    if (!config) return null;

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="gap-4 rounded-4xl border-none p-6 sm:max-w-[400px]" showCloseButton={false}>
                <div className="space-y-1.5 text-center">
                    <DialogTitle className="text-[18px] font-bold tracking-tight text-white">{config.title}</DialogTitle>
                    <p className="text-[13px] font-medium leading-relaxed text-zinc-500">{config.body}</p>
                </div>

                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onClose}
                        className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={config.run}
                        disabled={config.pending}
                        className={cn(
                            "h-12 flex-1 cursor-pointer rounded-full text-[14px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-60",
                            config.danger
                                ? "bg-pastelred text-white hover:bg-pastelred/90"
                                : "bg-white text-black hover:bg-white/90",
                        )}
                    >
                        {config.pending ? "Working…" : config.cta}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
