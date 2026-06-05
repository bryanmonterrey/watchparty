"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";

export function CreateChannelModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const [name, setName] = useState("");
    const [channelType, setChannelType] = useState<"TEXT" | "AUDIO" | "VIDEO">("TEXT");
    const utils = trpc.useUtils();

    const isModalOpen = isOpen && type === "createChannel";

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
            name,
            type: data.channelType ?? channelType,
        });
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-[#313338] border-none text-white p-0 overflow-hidden">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Create Channel
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-8">
                    <div className="space-y-4 px-6">
                        <div>
                            <Label className="uppercase text-xs font-bold text-zinc-400">
                                Channel Type
                            </Label>
                            <div className="flex gap-2 mt-2">
                                {(["TEXT", "AUDIO", "VIDEO"] as const).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setChannelType(t)}
                                        className={`px-3 py-1.5 rounded text-sm transition ${
                                            (data.channelType ?? channelType) === t
                                                ? "bg-indigo-500 text-white"
                                                : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                                        }`}
                                    >
                                        {t === "TEXT" ? "# Text" : t === "AUDIO" ? "🔊 Voice" : "📹 Video"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label className="uppercase text-xs font-bold text-zinc-400">
                                Channel name
                            </Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={createChannel.isPending}
                                className="mt-1.5 bg-zinc-900/50 border-none text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500"
                                placeholder="new-channel"
                                autoFocus
                            />
                        </div>
                    </div>

                    <DialogFooter className="bg-zinc-900/30 px-6 py-4">
                        <Button
                            disabled={createChannel.isPending || !name.trim()}
                            className="bg-indigo-500 hover:bg-indigo-600 text-white"
                        >
                            {createChannel.isPending ? "Creating..." : "Create Channel"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
