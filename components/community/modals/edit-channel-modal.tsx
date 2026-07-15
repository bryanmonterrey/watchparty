"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";

const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");

export function EditChannelModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const [name, setName] = useState("");
    const [readOnly, setReadOnly] = useState(false);
    const utils = trpc.useUtils();

    const isModalOpen = isOpen && type === "editChannel";
    const channel = data.channel;

    // Render-time seed (react-hooks/set-state-in-effect).
    const [seededFor, setSeededFor] = useState<string | null>(null);
    if (isModalOpen && channel && seededFor !== channel.id) {
        setSeededFor(channel.id);
        setName(channel.name);
        setReadOnly(!!channel.readOnly);
    }
    if (!isModalOpen && seededFor !== null) setSeededFor(null);

    const updateChannel = trpc.community.updateChannel.useMutation({
        onSuccess: () => {
            onClose();
            if (data.server?.id) utils.community.getServer.invalidate({ serverId: data.server.id });
        },
    });

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!slugify(name) || !channel?.id || !data.server?.id) return;
        updateChannel.mutate({
            channelId: channel.id,
            serverId: data.server.id,
            name: slugify(name),
            readOnly,
        });
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="gap-5 rounded-4xl border-none p-6 sm:max-w-[420px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">
                    Edit {channel?.type === "TEXT" ? `#${channel?.name}` : channel?.name}
                </DialogTitle>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Input
                            radius={14}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={updateChannel.isPending}
                            placeholder="channel-name"
                            maxLength={40}
                            autoFocus
                            className="h-12 text-[14px]"
                        />
                        {name && slugify(name) !== channel?.name && (
                            <p className="px-1 text-[12px] font-medium text-zinc-600">
                                Will become <span className="text-zinc-400">{channel?.type === "TEXT" ? "#" : ""}{slugify(name) || "…"}</span>
                            </p>
                        )}
                    </div>

                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 transition-colors hover:bg-white/[0.05]">
                        <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-bold text-white">Read-only</p>
                            <p className="mt-0.5 text-[12px] font-medium text-zinc-500">Only mods and admins can post here</p>
                        </div>
                        <Switch checked={readOnly} onCheckedChange={setReadOnly} disabled={updateChannel.isPending} />
                    </label>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={updateChannel.isPending || !slugify(name)}
                            className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
                        >
                            {updateChannel.isPending ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
