"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export function InviteModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const [copied, setCopied] = useState(false);

    const isModalOpen = isOpen && type === "invite";

    const inviteUrl = typeof window !== "undefined"
        ? `${window.location.origin}/communities/invite/${data.server?.inviteCode}`
        : "";

    const generateInvite = trpc.community.generateInviteCode.useMutation();

    const onCopy = () => {
        navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="gap-4 rounded-4xl p-6 sm:max-w-[440px]" showCloseButton={false}>
                <div className="text-center">
                    <DialogTitle className="text-[18px] font-bold tracking-tight text-white">
                        Invite friends{data.server?.name ? ` to ${data.server.name}` : ""}
                    </DialogTitle>
                    <p className="mt-1 text-[13px] font-medium text-zinc-500">Anyone with this link can join.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Input
                        radius={14}
                        readOnly
                        value={inviteUrl}
                        onFocus={(e) => e.target.select()}
                        className="h-12 flex-1 text-[13px] text-zinc-300"
                    />
                    <button
                        onClick={onCopy}
                        className={cn(
                            "flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors",
                            copied ? "bg-white/10 text-white" : "bg-white text-black hover:bg-white/90",
                        )}
                    >
                        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" strokeWidth={2} />
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>

                <button
                    onClick={() => data.server?.id && generateInvite.mutate({ serverId: data.server.id })}
                    disabled={generateInvite.isPending}
                    className="mx-auto flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
                >
                    <HugeiconsIcon icon={RefreshIcon} className={cn("size-3.5", generateInvite.isPending && "animate-spin")} strokeWidth={2} />
                    Generate a new link
                </button>
            </DialogContent>
        </Dialog>
    );
}
