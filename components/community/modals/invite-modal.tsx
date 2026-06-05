"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";

export function InviteModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const [copied, setCopied] = useState(false);

    const isModalOpen = isOpen && type === "invite";

    const inviteUrl = typeof window !== "undefined"
        ? `${window.location.origin}/communities/invite/${data.server?.inviteCode}`
        : "";

    const generateInvite = trpc.community.generateInviteCode.useMutation({
        onSuccess: () => {
            // Data will refresh automatically
        },
    });

    const onCopy = () => {
        navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="bg-[#313338] border-none text-white p-0 overflow-hidden">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Invite Friends
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6">
                    <Label className="uppercase text-xs font-bold text-zinc-400">
                        Server invite link
                    </Label>
                    <div className="flex items-center mt-2 gap-x-2">
                        <Input
                            readOnly
                            value={inviteUrl}
                            className="bg-zinc-900/50 border-none text-zinc-300 focus-visible:ring-0"
                        />
                        <Button
                            onClick={onCopy}
                            size="icon"
                            variant="ghost"
                            className="shrink-0"
                        >
                            {copied ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                            ) : (
                                <Copy className="w-4 h-4 text-zinc-400" />
                            )}
                        </Button>
                    </div>

                    <Button
                        onClick={() => data.server?.id && generateInvite.mutate({ serverId: data.server.id })}
                        disabled={generateInvite.isPending}
                        variant="link"
                        size="sm"
                        className="text-xs text-zinc-400 mt-4 p-0"
                    >
                        Generate a new link
                        <RefreshCw className={`w-4 h-4 ml-2 ${generateInvite.isPending ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
