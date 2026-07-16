"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const CHANNEL_TYPES = [
    { id: "TEXT" as const, label: "Text", desc: "Messages, images and links" },
    { id: "AUDIO" as const, label: "Voice", desc: "Hang out over voice" },
    { id: "VIDEO" as const, label: "Video", desc: "Face-to-face rooms" },
];

// Channel names read like slugs (#stream-chat) — mirror discord's input
// normalization so what you type is what you get.
const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");

export function CreateChannelModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const [name, setName] = useState("");
    const [channelType, setChannelType] = useState<"TEXT" | "AUDIO" | "VIDEO">("TEXT");
    const utils = trpc.useUtils();

    const isModalOpen = isOpen && type === "createChannel";
    const effectiveType = data.channelType ?? channelType;

    const createChannel = trpc.community.createChannel.useMutation({
        onSuccess: () => {
            setName("");
            setChannelType("TEXT");
            onClose();
            if (data.server?.id) {
                utils.community.getServer.invalidate({ serverId: data.server.id });
            }
        },
    });

    const handleClose = () => {
        setName("");
        setChannelType("TEXT");
        onClose();
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !data.server?.id) return;
        createChannel.mutate({
            serverId: data.server.id,
            name: slugify(name),
            type: effectiveType,
            categoryId: data.categoryId,
        });
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="gap-5 rounded-4xl border-none p-6 sm:max-w-[440px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Create a channel</DialogTitle>

                <form onSubmit={onSubmit} className="space-y-5">
                    {/* Type */}
                    <div className="flex flex-col gap-2">
                        {CHANNEL_TYPES.map((t) => {
                            const active = effectiveType === t.id;
                            return (
                                <Squircle asChild radius={16} key={t.id}>
                                    <button
                                        type="button"
                                        onClick={() => setChannelType(t.id)}
                                        disabled={!!data.channelType}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-3 p-3.5 text-left transition-colors disabled:cursor-default",
                                            active ? "bg-white/[0.08]" : "bg-white/[0.03] hover:bg-white/[0.06]",
                                            !!data.channelType && !active && "opacity-40",
                                        )}
                                    >
                                        <span className={cn(
                                            "grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-bold",
                                            active ? "bg-white text-black" : "bg-white/5 text-zinc-400",
                                        )}>
                                            {t.id === "TEXT" ? "#" : (
                                                <HugeiconsIcon icon={t.id === "AUDIO" ? Mic01Icon : Video01Icon} className="size-4" strokeWidth={2} />
                                            )}
                                        </span>
                                        <span className="min-w-0">
                                            <span className={cn("block text-[14px] font-bold", active ? "text-white" : "text-zinc-200")}>{t.label}</span>
                                            <span className="block text-[12px] font-medium text-zinc-500">{t.desc}</span>
                                        </span>
                                    </button>
                                </Squircle>
                            );
                        })}
                    </div>

                    {/* Name */}
                    <div className="space-y-1.5">
                        <Input
                            radius={14}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={createChannel.isPending}
                            placeholder="new-channel"
                            maxLength={40}
                            autoFocus
                            className="h-12 text-[14px]"
                        />
                        {name && (
                            <p className="px-1 text-[12px] font-medium text-zinc-600">
                                Will be created as <span className="text-zinc-400">{effectiveType === "TEXT" ? "#" : ""}{slugify(name) || "…"}</span>
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={createChannel.isPending || !slugify(name)}
                        className="h-12 w-full cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
                    >
                        {createChannel.isPending ? "Creating…" : "Create channel"}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
